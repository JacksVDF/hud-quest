import { expect, test } from '@playwright/test';

test('an unknown address shows the HUD 404 page with a 404 status', async ({ page }) => {
	const res = await page.goto('/this-sector-does-not-exist');
	expect(res!.status()).toBe(404);
	await expect(page.getByTestId('error-title')).toHaveText('SECTOR NOT FOUND');
	await expect(page.getByRole('heading', { name: 'Error 404' })).toBeVisible();
	await expect(page).toHaveTitle(/404/);
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});

test('the 404 page leads back to the start', async ({ page }) => {
	await page.goto('/nope/nothing');
	await page.getByRole('link', { name: 'BACK TO BASE' }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('heading', { name: '_TASKS;' })).toBeVisible();
});

test('a missing API route is not dressed up as a page', async ({ request }) => {
	const res = await request.get('/api/does-not-exist');
	expect(res.status()).toBe(404);
});

test('the 404 page keeps the theme and fits a phone', async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 800 });
	await page.goto('/missing');
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
	await expect(page.getByTestId('app-header')).toBeVisible();
});

test('pages carry icons, a theme colour and a full social preview', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
		'href',
		/\/apple-touch-icon\.png$/
	);
	await expect(page.locator('link[rel="icon"]')).toHaveCount(2);
	await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
	await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
		'content',
		/^https:\/\/.+\/og-image\.png$/
	);
	await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
		'content',
		'summary_large_image'
	);
	// Exactly one of each, so a link preview never reads two conflicting values.
	await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
	await expect(page.locator('meta[name="twitter:card"]')).toHaveCount(1);
});

test('the icon files and the social image are served as images', async ({ request }) => {
	for (const file of ['/icon-32.png', '/apple-touch-icon.png', '/og-image.png']) {
		const res = await request.get(file);
		expect(res.status(), file).toBe(200);
		expect(res.headers()['content-type'], file).toContain('image/png');
	}
});
