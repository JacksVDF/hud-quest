import { expect, test } from '@playwright/test';

// These tests need the panel to be available, so they start from an empty browser.
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('loading…')).toHaveCount(0);
});

test('a first visit explains how the game works, using the real numbers', async ({ page }) => {
	const welcome = page.getByTestId('welcome');
	await expect(welcome).toBeVisible();
	await expect(welcome).toContainText('EASY +10');
	await expect(welcome).toContainText('MEDIUM +25');
	await expect(welcome).toContainText('HARD +50');
	await expect(welcome).toContainText('Level 1 needs 100 XP');
	await expect(welcome).toContainText('EMBER');
});

test('closing it keeps it closed after a reload', async ({ page }) => {
	await page.getByTestId('welcome-close').click();
	await expect(page.getByTestId('welcome')).toHaveCount(0);
	await page.reload();
	await expect(page.getByText('loading…')).toHaveCount(0);
	await expect(page.getByTestId('welcome')).toHaveCount(0);
});

test('it goes away once there is a task, and does not return after the task is gone', async ({
	page
}) => {
	await expect(page.getByTestId('welcome')).toBeVisible();
	await page.getByLabel('NEW_TASK_').fill('first');
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await expect(page.getByTestId('welcome')).toHaveCount(0);
});

test('someone who already has data never sees it', async ({ page }) => {
	await page.evaluate(() =>
		localStorage.setItem(
			'hud-quest-todo:tasks',
			JSON.stringify({
				workspaces: [],
				activity: {},
				tasks: [
					{ id: 'a', title: 'old', complexity: 'easy', done: false, tags: [], items: [], notes: '' }
				]
			})
		)
	);
	await page.reload();
	await expect(page.getByText('old')).toBeVisible();
	await expect(page.getByTestId('welcome')).toHaveCount(0);
});
