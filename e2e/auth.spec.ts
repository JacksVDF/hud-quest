import { expect, test, type Page } from '@playwright/test';

// The rate limit is per IP. Locally nothing overwrites this header, so every test gets its own
// "client" and repeated runs never share a bucket.
test.beforeEach(async ({ context }) => {
	const n = () => Math.floor(Math.random() * 254) + 1;
	await context.setExtraHTTPHeaders({ 'cf-connecting-ip': `10.${n()}.${n()}.${n()}` });
});

const PASSWORD = 'correct-horse-1';
const uniqueEmail = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

async function fillAndSubmit(page: Page, email: string, password: string, button: RegExp) {
	await page.getByLabel('EMAIL_').fill(email);
	await page.getByLabel('PASSWORD_').fill(password);
	await page.getByRole('button', { name: button }).click();
}

async function signUp(page: Page, email: string) {
	await page.goto('/signup');
	await fillAndSubmit(page, email, PASSWORD, /CREATE ACCOUNT/);
	await expect(page.getByTestId('account-email')).toHaveText(email.toLowerCase());
}

test('guests see LOGIN in the header', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('link', { name: 'LOGIN' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'LOGOUT' })).toHaveCount(0);
});

test('signs up, shows the email, and stays signed in after a reload', async ({ page }) => {
	const email = uniqueEmail();
	await signUp(page, email);
	await expect(page).toHaveURL('/');
	await page.reload();
	await expect(page.getByTestId('account-email')).toHaveText(email);
});

test('logs out and logs back in', async ({ page }) => {
	const email = uniqueEmail();
	await signUp(page, email);

	await page.getByRole('button', { name: 'LOGOUT' }).click();
	await expect(page.getByRole('link', { name: 'LOGIN' })).toBeVisible();

	await page.getByRole('link', { name: 'LOGIN' }).click();
	await fillAndSubmit(page, email, PASSWORD, /LOGIN >/);
	await expect(page.getByTestId('account-email')).toHaveText(email);
});

test('shows a generic error for a wrong password', async ({ page }) => {
	const email = uniqueEmail();
	await signUp(page, email);
	await page.getByRole('button', { name: 'LOGOUT' }).click();

	await page.goto('/login');
	await fillAndSubmit(page, email, 'not-the-password', /LOGIN >/);
	await expect(page.getByRole('alert')).toHaveText(/Wrong email or password/);
	await expect(page).toHaveURL(/\/login$/);
});

test('rejects a short password on sign up', async ({ page }) => {
	await page.goto('/signup');
	await fillAndSubmit(page, uniqueEmail(), 'short', /CREATE ACCOUNT/);
	// Blocked by the browser's minlength check, so nothing is sent and the URL does not change.
	await expect(page).toHaveURL(/\/signup$/);
	await expect(page.getByTestId('account-email')).toHaveCount(0);
});

test('rejects an email that is already registered', async ({ page }) => {
	const email = uniqueEmail();
	await signUp(page, email);
	await page.getByRole('button', { name: 'LOGOUT' }).click();

	await page.goto('/signup');
	await fillAndSubmit(page, email, PASSWORD, /CREATE ACCOUNT/);
	await expect(page.getByRole('alert')).toHaveText(/already registered/);
});

test('an account has its own task list, and guest tasks come back after logout', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.getByText('loading…')).toHaveCount(0);
	await page.getByLabel('NEW_TASK_').fill('Guest task');
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await expect(page.getByText('Guest task')).toBeVisible();

	await signUp(page, uniqueEmail());
	await expect(page.getByText('No tasks yet')).toBeVisible();
	await expect(page.getByText('Guest task')).toHaveCount(0);
	await page.getByRole('button', { name: 'NOT NOW' }).click();

	await page.getByLabel('NEW_TASK_').fill('Account task');
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await expect(page.getByText('Account task')).toBeVisible();
	await page.reload();
	await expect(page.getByText('Account task')).toBeVisible();

	await page.getByRole('button', { name: 'LOGOUT' }).click();
	await expect(page.getByText('Guest task')).toBeVisible();
	await expect(page.getByText('Account task')).toHaveCount(0);
});

test('account tasks follow the user to another browser session', async ({ page, browser }) => {
	const email = uniqueEmail();
	await signUp(page, email);
	await page.getByLabel('NEW_TASK_').fill('Everywhere');
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await expect(page.getByText('Everywhere')).toBeVisible();
	// Saving is asynchronous: wait until the server has it before opening the second session.
	await expect
		.poll(async () => (await (await page.request.get('/api/tasks')).json()).length)
		.toBe(1);

	const other = await browser.newContext({
		extraHTTPHeaders: { 'cf-connecting-ip': '10.99.99.99' }
	});
	const page2 = await other.newPage();
	await page2.goto('/login');
	await fillAndSubmit(page2, email, PASSWORD, /LOGIN >/);
	await expect(page2.getByText('Everywhere')).toBeVisible();
	await other.close();
});

test('imports guest tasks into the account once, then offers nothing more', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('loading…')).toHaveCount(0);
	for (const title of ['First guest', 'Second guest']) {
		await page.getByLabel('NEW_TASK_').fill(title);
		await page.getByRole('button', { name: /^ADD >/ }).click();
		await expect(page.getByText(title)).toBeVisible();
	}

	const email = uniqueEmail();
	await signUp(page, email);
	await expect(page.getByTestId('import-prompt')).toContainText('2 tasks');
	await page.getByRole('button', { name: /IMPORT/ }).click();
	await expect(page.getByText('Imported 2 tasks into your account.')).toBeVisible();
	await expect(page.getByText('First guest')).toBeVisible();
	await expect(page.getByText('Second guest')).toBeVisible();
	await expect(page.getByTestId('import-prompt')).toHaveCount(0);

	// Saved in the account, and the browser copy is gone: no second offer after a reload.
	await page.reload();
	await expect(page.getByText('First guest')).toBeVisible();
	await expect(page.getByTestId('import-prompt')).toHaveCount(0);

	// As a guest again, the browser list is empty.
	await page.getByRole('button', { name: 'LOGOUT' }).click();
	await expect(page.getByText('No tasks yet')).toBeVisible();
});

test('keeps guest tasks in the browser when the import is skipped', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('loading…')).toHaveCount(0);
	await page.getByLabel('NEW_TASK_').fill('Keep me');
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await signUp(page, uniqueEmail());
	await page.getByRole('button', { name: 'NOT NOW' }).click();
	await expect(page.getByTestId('import-prompt')).toHaveCount(0);
	await page.getByRole('button', { name: 'LOGOUT' }).click();
	await expect(page.getByText('Keep me')).toBeVisible();
});

test('a second tab that saved first makes the first tab stop and offer a reload', async ({
	browser
}) => {
	const context = await browser.newContext({
		extraHTTPHeaders: { 'cf-connecting-ip': `10.${Math.floor(Math.random() * 250) + 1}.7.7` }
	});
	const tabA = await context.newPage();
	await signUp(tabA, uniqueEmail());

	const tabB = await context.newPage();
	await tabB.goto('/');
	await expect(tabB.getByTestId('account-email')).toBeVisible();
	await expect(tabB.getByText('loading…')).toHaveCount(0);

	// Tab B saves first.
	await tabB.getByLabel('NEW_TASK_').fill('From B');
	await tabB.getByRole('button', { name: /^ADD >/ }).click();
	await expect(tabB.getByText('From B')).toBeVisible();
	await expect
		.poll(async () => (await (await tabB.request.get('/api/tasks')).json()).length)
		.toBe(1);

	// Tab A still has version 0: its save is refused and nothing of B is lost.
	await tabA.getByLabel('NEW_TASK_').fill('From A');
	await tabA.getByRole('button', { name: /^ADD >/ }).click();
	await expect(tabA.getByRole('alert')).toContainText('changed in another tab');

	await tabA.getByRole('button', { name: /RELOAD TASKS/ }).click();
	await expect(tabA.getByText('From B')).toBeVisible();
	await expect(tabA.getByText('From A')).toHaveCount(0);
	await expect(tabA.getByRole('alert')).toHaveCount(0);

	// And it can save again.
	await tabA.getByLabel('NEW_TASK_').fill('From A again');
	await tabA.getByRole('button', { name: /^ADD >/ }).click();
	await expect
		.poll(async () => (await (await tabA.request.get('/api/tasks')).json()).length)
		.toBe(2);
	await context.close();
});

test('deletes the account after confirming the password, with all its data', async ({
	page,
	context
}) => {
	const email = uniqueEmail();
	await signUp(page, email);
	await page.getByLabel('NEW_TASK_').fill('Doomed task');
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await expect
		.poll(async () => (await (await page.request.get('/api/tasks')).json()).length)
		.toBe(1);

	await page.getByTestId('account-email').click();
	await expect(page).toHaveURL(/\/account$/);
	await page.getByRole('button', { name: 'DELETE ACCOUNT' }).click();

	// A wrong password deletes nothing.
	await page.getByLabel('CONFIRM_PASSWORD_').fill('not-the-password');
	await page.getByRole('button', { name: /DELETE FOREVER/ }).click();
	await expect(page.getByRole('alert')).toHaveText(/Wrong password/);
	expect((await page.request.get('/api/tasks')).status()).toBe(200);

	await page.getByLabel('CONFIRM_PASSWORD_').fill(PASSWORD);
	await page.getByRole('button', { name: /DELETE FOREVER/ }).click();
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('link', { name: 'LOGIN' })).toBeVisible();
	expect((await page.request.get('/api/tasks')).status()).toBe(401);

	// The account is gone: the same credentials no longer work.
	await page.goto('/login');
	await fillAndSubmit(page, email, PASSWORD, /LOGIN >/);
	await expect(page.getByRole('alert')).toHaveText(/Wrong email or password/);
	await context.clearCookies();
});

test('deleting an account requires the password in the request', async ({ page }) => {
	await signUp(page, uniqueEmail());
	const res = await page.request.post('/api/auth/delete-user', { data: {} });
	expect(res.status()).toBe(400);
	expect((await page.request.get('/api/tasks')).status()).toBe(200);
});
