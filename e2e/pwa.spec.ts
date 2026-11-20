import { expect, test, type Page } from '@playwright/test';

// The one place where the service worker is allowed to run.
test.use({ serviceWorkers: 'allow' });

test.beforeEach(async ({ context }) => {
	const n = () => Math.floor(Math.random() * 254) + 1;
	await context.setExtraHTTPHeaders({ 'cf-connecting-ip': `10.${n()}.${n()}.${n()}` });
});

const PASSWORD = 'correct-horse-1';
const uniqueEmail = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

/** Waits until the worker is active and controls this page. */
async function controlled(page: Page) {
	await page.goto('/');
	await page.evaluate(() => navigator.serviceWorker.ready);
	// The first install claims the page a moment after it activates.
	await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

/**
 * Playwright cannot change the bytes the browser fetches for the worker, so a new version is
 * made by registering the same worker under another address in the same scope.
 */
const publishNewVersion = (page: Page) =>
	page.evaluate(() => navigator.serviceWorker.register('/service-worker.js?next', { scope: '/' }));

const cachedUrls = (page: Page) =>
	page.evaluate(async () => {
		const urls: string[] = [];
		for (const key of await caches.keys()) {
			for (const request of await (await caches.open(key)).keys()) {
				urls.push(new URL(request.url).pathname);
			}
		}
		return urls;
	});

test('the manifest is valid and its icons are served', async ({ page, request }) => {
	await page.goto('/');
	const href = await page.locator('link[rel="manifest"]').getAttribute('href');
	const res = await request.get(href!);
	expect(res.ok()).toBe(true);
	const manifest = await res.json();
	expect(manifest).toMatchObject({ name: 'HUD//QUEST', display: 'standalone', start_url: '/' });
	const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
	expect(sizes).toContain('192x192');
	expect(sizes).toContain('512x512');
	expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable')).toBe(
		true
	);
	for (const icon of manifest.icons) {
		const file = await request.get(icon.src);
		expect(file.ok()).toBe(true);
		expect(file.headers()['content-type']).toContain('image/png');
	}
});

test('the app opens offline for a guest, and guest tasks keep working', async ({
	page,
	context
}) => {
	await controlled(page);
	await page.getByLabel('NEW_TASK_').fill('Offline quest');
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await expect(page.getByText('Offline quest')).toBeVisible();

	await context.setOffline(true);
	await page.reload();
	await expect(page.getByRole('heading', { name: '_TASKS;' })).toBeVisible();
	await expect(page.getByText('Offline quest')).toBeVisible();
	await expect(page.getByRole('link', { name: 'LOGIN' })).toBeVisible();

	await page.getByLabel('NEW_TASK_').fill('Added offline');
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await expect(page.getByText('Added offline')).toBeVisible();
	await context.setOffline(false);
});

test('other pages of the app open offline too, and unknown addresses go to the start page', async ({
	page,
	context
}) => {
	await controlled(page);
	await context.setOffline(true);
	await page.goto('/stats');
	await expect(page.getByRole('heading', { name: '_STATS;' })).toBeVisible();
	await page.goto('/w/not-cached');
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('heading', { name: '_TASKS;' })).toBeVisible();
	await context.setOffline(false);
});

test('the cache holds the shell and never anything from /api', async ({ page }) => {
	await controlled(page);
	// Make the app call the API (session check) before looking at the cache.
	await page.reload();
	await expect(page.getByRole('link', { name: 'LOGIN' })).toBeVisible();
	const urls = await cachedUrls(page);
	expect(urls.length).toBeGreaterThan(5);
	expect(urls).toContain('/');
	expect(urls.some((url) => url.startsWith('/api'))).toBe(false);
});

test('a signed-in user never has account data stored on the device', async ({ page }) => {
	const email = uniqueEmail();
	await controlled(page);
	await page.goto('/signup');
	await page.getByLabel('EMAIL_').fill(email);
	await page.getByLabel('PASSWORD_').fill(PASSWORD);
	await page.getByRole('button', { name: /CREATE ACCOUNT/ }).click();
	await expect(page.getByTestId('account-email')).toHaveText(email.split('@')[0]);

	await page.getByLabel('NEW_TASK_').fill('Secret quest');
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await expect(page.getByText('Secret quest')).toBeVisible();
	await page.reload();
	await expect(page.getByText('Secret quest')).toBeVisible();

	expect((await cachedUrls(page)).some((url) => url.startsWith('/api'))).toBe(false);
	const local = await page.evaluate(() => JSON.stringify({ ...localStorage }));
	expect(local).not.toContain('Secret quest');
	expect(local).not.toContain(email);
});

test('a signed-in user opening the app offline gets a notice, not the guest view', async ({
	page,
	context
}) => {
	const email = uniqueEmail();
	await controlled(page);
	// A guest task that must not be shown in place of the account.
	await page.getByLabel('NEW_TASK_').fill('Guest only');
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await expect(page.getByText('Guest only')).toBeVisible();

	await page.goto('/signup');
	await page.getByLabel('EMAIL_').fill(email);
	await page.getByLabel('PASSWORD_').fill(PASSWORD);
	await page.getByRole('button', { name: /CREATE ACCOUNT/ }).click();
	await expect(page.getByTestId('account-email')).toHaveText(email.split('@')[0]);

	await context.setOffline(true);
	await page.reload();
	await expect(page.getByTestId('offline-blocked')).toBeVisible();
	await expect(page.getByTestId('offline-badge')).toBeVisible();
	await expect(page.getByRole('link', { name: 'LOGIN' })).toHaveCount(0);
	await expect(page.getByText('Guest only')).toHaveCount(0);

	// Back online, the account comes back by itself.
	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	await expect(page.getByTestId('account-email')).toHaveText(email.split('@')[0]);
	await expect(page.getByTestId('offline-blocked')).toHaveCount(0);
});

test('a signed-in user who goes offline sees a notice and the list stays on screen', async ({
	page,
	context
}) => {
	const email = uniqueEmail();
	await controlled(page);
	await page.goto('/signup');
	await page.getByLabel('EMAIL_').fill(email);
	await page.getByLabel('PASSWORD_').fill(PASSWORD);
	await page.getByRole('button', { name: /CREATE ACCOUNT/ }).click();
	await expect(page.getByTestId('account-email')).toHaveText(email.split('@')[0]);
	await page.getByLabel('NEW_TASK_').fill('On screen');
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await expect(page.getByText('On screen')).toBeVisible();

	await context.setOffline(true);
	await expect(page.getByTestId('offline-notice')).toBeVisible();
	await expect(page.getByText('On screen')).toBeVisible();
	await context.setOffline(false);
	await expect(page.getByTestId('offline-notice')).toHaveCount(0);
});

test('a new version waits behind a banner and only reloads when accepted', async ({ page }) => {
	await controlled(page);
	await expect(page.getByTestId('update-banner')).toHaveCount(0);

	await publishNewVersion(page);

	await expect(page.getByTestId('update-banner')).toBeVisible();
	// It did not swap or reload by itself.
	expect(await page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe('activated');

	await page.getByRole('button', { name: 'LATER' }).click();
	await expect(page.getByTestId('update-banner')).toHaveCount(0);
});

test('accepting the update reloads the page', async ({ page }) => {
	await controlled(page);
	await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1));
	await publishNewVersion(page);
	await expect(page.getByTestId('update-banner')).toBeVisible();
	await page.getByRole('button', { name: /RELOAD >/ }).click();
	await page.waitForFunction(() => (window as unknown as { marker?: number }).marker === undefined);
	await expect(page.getByRole('heading', { name: '_TASKS;' })).toBeVisible();
});
