import { expect, test, type Page } from '@playwright/test';

/** A local day relative to today, computed in the browser so it matches the app's own clock. */
const day = (page: Page, offset: number) =>
	page.evaluate((n) => {
		const d = new Date();
		d.setDate(d.getDate() + n);
		const p = (x: number) => String(x).padStart(2, '0');
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
	}, offset);

const entry = (easy: number, xp: number) => ({ easy, medium: 0, hard: 0, xp });

/** Guest data saved in this browser, as the app itself would have written it. */
async function seed(page: Page, activity: Record<string, unknown>) {
	await page.evaluate(
		(a) =>
			localStorage.setItem(
				'hud-quest-todo:tasks',
				JSON.stringify({ workspaces: [], tasks: [], activity: a })
			),
		activity
	);
}

test('the streak starts at 0 and the stats page says there is nothing yet', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('streak')).toContainText('STREAK 0D');
	await page.getByTestId('streak').click();
	await expect(page).toHaveURL(/\/stats$/);
	await expect(page.getByRole('heading', { name: '_STATS;' })).toBeVisible();
	await expect(page.getByTestId('stats-empty')).toBeVisible();
});

test('completing a task starts a streak, and undoing it takes it away', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('loading…')).toHaveCount(0);
	await page.getByLabel('NEW_TASK_').fill('streak starter');
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await page.getByRole('checkbox', { name: 'Mark "streak starter" as done' }).click();
	await expect(page.getByTestId('streak')).toContainText('STREAK 1D');

	await page.getByTestId('streak').click();
	await expect(page.getByTestId('current-streak')).toHaveText('1');
	await expect(page.getByTestId('week-tasks')).toHaveText('1');
	await expect(page.getByTestId('week-xp')).toHaveText('10');

	await page.goBack();
	await page.getByRole('checkbox', { name: 'Mark "streak starter" as not done' }).click();
	await expect(page.getByTestId('streak')).toContainText('STREAK 0D');
});

test('shows the current and best streak, the totals and the 14 bars', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('loading…')).toHaveCount(0);
	await seed(page, {
		[await day(page, 0)]: entry(2, 20),
		[await day(page, -1)]: entry(1, 10),
		// A gap at -2, then an older run of four days.
		[await day(page, -4)]: entry(1, 10),
		[await day(page, -5)]: entry(1, 10),
		[await day(page, -6)]: entry(1, 10),
		[await day(page, -7)]: entry(1, 10),
		[await day(page, -20)]: entry(5, 50)
	});
	await page.goto('/stats');
	await expect(page.getByTestId('current-streak')).toHaveText('2');
	await expect(page.getByTestId('best-streak')).toHaveText('4');
	// A 7-day window is today and the six days before it, so day -7 is outside it.
	await expect(page.getByTestId('week-tasks')).toHaveText('6');
	await expect(page.getByTestId('week-xp')).toHaveText('60');
	await expect(page.getByTestId('month-tasks')).toHaveText('12');
	await expect(page.getByTestId('month-xp')).toHaveText('120');
	await expect(page.getByTestId('bar')).toHaveCount(14);
});

test('an empty today does not break the streak, but a missed day does', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('loading…')).toHaveCount(0);
	await seed(page, { [await day(page, -1)]: entry(1, 10), [await day(page, -2)]: entry(1, 10) });
	await page.goto('/stats');
	await expect(page.getByTestId('current-streak')).toHaveText('2');

	await seed(page, { [await day(page, -2)]: entry(1, 10), [await day(page, -3)]: entry(1, 10) });
	await page.goto('/stats');
	await expect(page.getByTestId('current-streak')).toHaveText('0');
	await expect(page.getByTestId('best-streak')).toHaveText('2');
});

test('deleting a task and emptying the trash keeps the history', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('loading…')).toHaveCount(0);
	await page.getByLabel('NEW_TASK_').fill('gone soon');
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await page.getByRole('checkbox', { name: 'Mark "gone soon" as done' }).click();
	await page.getByRole('button', { name: 'Delete "gone soon"' }).click();
	await page.getByRole('button', { name: /_TRASH/ }).click();
	await page.getByRole('button', { name: 'EMPTY TRASH' }).click();
	await expect(page.getByTestId('trash')).toHaveCount(0);
	await expect(page.getByTestId('streak')).toContainText('STREAK 1D');
	await page.getByTestId('streak').click();
	await expect(page.getByTestId('week-tasks')).toHaveText('1');
});

test('the stats page works at phone width without sideways scrolling', async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 800 });
	await page.goto('/');
	await expect(page.getByText('loading…')).toHaveCount(0);
	await seed(page, { [await day(page, 0)]: entry(3, 30) });
	await page.goto('/stats');
	await expect(page.getByTestId('totals')).toBeVisible();
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
});
