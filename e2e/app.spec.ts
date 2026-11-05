import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('loading…')).toHaveCount(0);
});

async function addTask(page: Page, title: string, complexity: 'EASY' | 'MEDIUM' | 'HARD' = 'EASY') {
	await page.getByLabel('NEW_TASK_').fill(title);
	await page.getByRole('radio', { name: new RegExp(complexity, 'i') }).check({ force: true });
	await page.getByRole('button', { name: /^ADD >/ }).click();
	// Wait for the form to reset; the new task may be on another page, so it is not checked here.
	await expect(page.getByLabel('NEW_TASK_')).toHaveValue('');
}

test('has a title and a meta description', async ({ page }) => {
	await expect(page).toHaveTitle(/HUD\/\/QUEST/);
	await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /XP/);
	await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
});

test('disabled ADD button is not full width on mobile', async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 800 });
	const button = page.getByRole('button', { name: /^ADD >/ });
	await expect(button).toBeDisabled();
	const box = await button.boundingBox();
	expect(box!.width).toBeLessThan(200);
});

test('adds an easy task, completes it and undoes it', async ({ page }) => {
	await addTask(page, 'Buy milk');
	await page.getByRole('checkbox', { name: 'Mark "Buy milk" as done' }).click();
	await expect(page.getByText('Task completed: +10 XP.')).toBeVisible();
	await page.getByRole('checkbox', { name: 'Mark "Buy milk" as not done' }).click();
	await expect(page.getByText('Task reopened: -10 XP.')).toBeVisible();
});

test('persists tasks after a reload', async ({ page }) => {
	await addTask(page, 'Survive reload');
	await page.reload();
	await expect(page.getByText('Survive reload')).toBeVisible();
});

test('levels up after 100 XP', async ({ page }) => {
	for (let i = 0; i < 10; i++) await addTask(page, `easy ${i}`);
	for (let i = 0; i < 10; i++) {
		await page.getByRole('checkbox', { name: `Mark "easy ${i}" as done` }).click();
	}
	await expect(page.getByText(/LEVEL UP! You reached level 2/)).toBeVisible();
});

test('a medium task completes by itself when its last subtask is ticked', async ({ page }) => {
	await addTask(page, 'Medium job', 'MEDIUM');
	const task = page.getByRole('listitem').filter({ hasText: 'Medium job' }).first();
	await task.getByRole('button', { name: /SUBTASKS/ }).click();
	for (const s of ['one', 'two']) {
		await task.getByLabel('New subtask').fill(s);
		await task.getByRole('button', { name: 'ADD', exact: true }).click();
	}
	await expect(task.getByText('completes automatically')).toBeVisible();
	await expect(task.getByRole('checkbox', { name: /Mark "Medium job"/ })).toBeDisabled();

	await task.getByRole('checkbox', { name: 'Mark subtask "one" as done' }).click();
	await expect(task.getByRole('checkbox', { name: 'Mark "Medium job" as done' })).toBeVisible();
	await task.getByRole('checkbox', { name: 'Mark subtask "two" as done' }).click();
	await expect(page.getByText('Task completed: +25 XP.')).toBeVisible();
	await expect(task.getByRole('checkbox', { name: 'Mark "Medium job" as not done' })).toBeVisible();
	await expect(task.getByText('completes automatically')).toHaveCount(0);
});

test('a hard project releases XP per milestone', async ({ page }) => {
	await addTask(page, 'Big project', 'HARD');
	const task = page.getByRole('listitem').filter({ hasText: 'Big project' }).first();
	await task.getByRole('button', { name: /PROJECT/ }).click();
	for (const m of ['a', 'b']) {
		await task.getByLabel('New milestone').fill(m);
		await task.getByRole('button', { name: 'ADD', exact: true }).click();
	}
	await task.getByRole('checkbox', { name: 'Mark milestone "a" as done' }).click();
	await expect(page.getByText('Milestone completed: +25 XP.')).toBeVisible();
	await task.getByRole('checkbox', { name: 'Mark milestone "b" as done' }).click();
	await expect(page.getByText('Milestone completed: +25 XP.')).toBeVisible();
	await expect(
		task.getByRole('checkbox', { name: 'Mark "Big project" as not done' })
	).toBeVisible();
});

test('filters by status and by tag', async ({ page }) => {
	await page.getByLabel('NEW_TASK_').fill('Work task');
	await page.getByLabel('TAGS_').fill('work');
	await page.getByLabel('TAGS_').press('Enter');
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await addTask(page, 'Home task');
	await page.getByRole('checkbox', { name: 'Mark "Home task" as done' }).click();

	await page.getByText('DONE', { exact: true }).click();
	await expect(page.getByText('Home task')).toBeVisible();
	await expect(page.getByText('Work task')).toHaveCount(0);

	await page.getByText('ALL', { exact: true }).first().click();
	await page.getByRole('button', { name: '#work' }).click();
	await expect(page.getByText('Work task')).toBeVisible();
	await expect(page.getByText('Home task')).toHaveCount(0);
});

test('paginates long lists', async ({ page }) => {
	for (let i = 1; i <= 12; i++) await addTask(page, `task ${String(i).padStart(2, '0')}`);
	const pager = page.getByRole('navigation', { name: 'Pagination' });
	await expect(pager.getByRole('button', { name: 'Page 2' })).toBeVisible();
	await expect(pager.getByRole('button', { name: 'Page 1' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await expect(page.getByText('task 01')).toBeVisible();
	await expect(page.getByText('task 12')).toHaveCount(0);

	await pager.getByRole('button', { name: 'Next page' }).click();
	await expect(page.getByText('task 12')).toBeVisible();
	await expect(page.getByText('task 01')).toHaveCount(0);

	// Deleting both tasks on the last page falls back to page 1 and hides the pager.
	await page.getByRole('button', { name: 'Delete "task 11"' }).click();
	await page.getByRole('button', { name: 'Delete "task 12"' }).click();
	await expect(pager).toHaveCount(0);
	await expect(page.getByText('task 01')).toBeVisible();
});

test('touch targets are at least 36px tall', async ({ page }) => {
	await page.getByLabel('NEW_TASK_').fill('Tagged');
	await page.getByLabel('TAGS_').fill('x');
	await page.getByLabel('TAGS_').press('Enter');
	const remove = page.getByRole('button', { name: 'Remove tag x' });
	// The chip scales in, so wait until the animation has finished.
	await expect.poll(async () => (await remove.boundingBox())!.height).toBeGreaterThanOrEqual(36);
	await page.getByRole('button', { name: /^ADD >/ }).click();
	const chip = page.getByRole('button', { name: '#x' });
	expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(36);
});

test('done text is readable (opacity 0.75)', async ({ page }) => {
	await addTask(page, 'Faded');
	await page.getByRole('checkbox', { name: 'Mark "Faded" as done' }).click();
	const text = page.getByText('Faded', { exact: true });
	await expect.poll(() => text.evaluate((el) => getComputedStyle(el).opacity)).toBe('0.75');
});

test('theme toggle switches between light and dark', async ({ page }) => {
	const before = await page.evaluate(() => document.documentElement.dataset.theme);
	await page.getByRole('button', { name: 'Toggle light/dark theme' }).click();
	const after = await page.evaluate(() => document.documentElement.dataset.theme);
	expect(after).not.toBe(before);
});
