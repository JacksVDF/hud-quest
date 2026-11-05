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

test('guest tasks are still kept after logging in (no sync yet)', async ({ page }) => {
	await page.goto('/');
	await page.getByLabel('NEW_TASK_').fill('Guest task');
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await signUp(page, uniqueEmail());
	await expect(page.getByText('Guest task')).toBeVisible();
});
