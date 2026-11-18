import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('loading…')).toHaveCount(0);
});

/** A local day relative to today, computed in the browser so it matches the app's own clock. */
const day = (page: Page, offset: number) =>
	page.evaluate((n) => {
		const d = new Date();
		d.setDate(d.getDate() + n);
		const p = (x: number) => String(x).padStart(2, '0');
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
	}, offset);

async function addTask(page: Page, title: string, due?: string, repeat?: string) {
	await page.getByLabel('NEW_TASK_').fill(title);
	if (due) await page.getByTestId('due-date').first().fill(due);
	if (repeat) await page.getByTestId('repeat').first().selectOption(repeat);
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await expect(page.getByLabel('NEW_TASK_')).toHaveValue('');
}

/** The task list, not the calendar's list of the day, which shows the same tasks. */
const list = (page: Page) => page.locator('section[aria-labelledby="list-title"]');

const row = (page: Page, title: string) =>
	list(page).getByRole('listitem').filter({ hasText: title }).first();

test('the repeat is disabled until there is a date, and clears with it', async ({ page }) => {
	const repeat = page.getByTestId('repeat').first();
	await expect(repeat).toBeDisabled();
	await page
		.getByTestId('due-date')
		.first()
		.fill(await day(page, 3));
	await expect(repeat).toBeEnabled();
	await repeat.selectOption('weekly');
	await page.getByTestId('due-date').first().fill('');
	await expect(repeat).toBeDisabled();
	await expect(repeat).toHaveValue('');
});

test('shows OVERDUE, TODAY and upcoming deadlines', async ({ page }) => {
	await addTask(page, 'late one', await day(page, -2));
	await addTask(page, 'today one', await day(page, 0));
	await addTask(page, 'later one', await day(page, 5));
	await expect(row(page, 'late one').locator('[data-due]')).toHaveAttribute('data-due', 'overdue');
	await expect(row(page, 'late one')).toContainText('OVERDUE');
	await expect(row(page, 'today one').locator('[data-due]')).toHaveAttribute('data-due', 'today');
	await expect(row(page, 'today one')).toContainText('TODAY');
	await expect(row(page, 'later one').locator('[data-due]')).toHaveAttribute(
		'data-due',
		'upcoming'
	);
});

test('a finished task no longer shows as overdue', async ({ page }) => {
	await addTask(page, 'finish me', await day(page, -1));
	await page.getByRole('checkbox', { name: 'Mark "finish me" as done' }).click();
	await expect(row(page, 'finish me').locator('[data-due]')).toHaveAttribute('data-due', 'none');
	await expect(row(page, 'finish me')).not.toContainText('OVERDUE');
});

test('the due filter keeps only open tasks due today or overdue', async ({ page }) => {
	await addTask(page, 'no date');
	await addTask(page, 'late one', await day(page, -1));
	await addTask(page, 'today one', await day(page, 0));
	await addTask(page, 'later one', await day(page, 4));
	await page.getByTestId('filter-due').click();
	await expect(list(page).getByText('late one')).toBeVisible();
	await expect(list(page).getByText('today one')).toBeVisible();
	await expect(list(page).getByText('later one')).toHaveCount(0);
	await expect(list(page).getByText('no date')).toHaveCount(0);
	await page.getByTestId('filter-due').click();
	await expect(list(page).getByText('later one')).toBeVisible();
});

test('edits and clears a deadline', async ({ page }) => {
	await addTask(page, 'move me');
	// The editor opens inside the task's own row, which has its own date and repeat fields.
	// While editing, the title is an input value rather than text, so find the row by that input.
	const editor = () =>
		list(page)
			.getByRole('listitem')
			.filter({ has: page.getByLabel('Task title') });
	await page.getByRole('button', { name: 'Edit "move me"' }).click();
	await editor()
		.getByTestId('due-date')
		.fill(await day(page, 2));
	await editor().getByTestId('repeat').selectOption('daily');
	await editor().getByRole('button', { name: 'SAVE' }).click();
	await expect(row(page, 'move me').locator('[data-due]')).toHaveAttribute('data-due', 'upcoming');
	await expect(row(page, 'move me')).toContainText('DAILY');

	await page.getByRole('button', { name: 'Edit "move me"' }).click();
	await editor().getByTestId('due-date').fill('');
	await editor().getByRole('button', { name: 'SAVE' }).click();
	await expect(row(page, 'move me').locator('[data-due]')).toHaveCount(0);
	await expect(row(page, 'move me')).not.toContainText('DAILY');
});

test('completing a recurring task creates the next one, and the deadline survives a reload', async ({
	page
}) => {
	await addTask(page, 'water plants', await day(page, 0), 'weekly');
	await page.getByRole('checkbox', { name: 'Mark "water plants" as done' }).click();
	await expect(list(page).getByText('water plants')).toHaveCount(2);

	await page.reload();
	await expect(page.getByText('loading…')).toHaveCount(0);
	await expect(list(page).getByText('water plants')).toHaveCount(2);
	const open = page.getByRole('checkbox', { name: 'Mark "water plants" as done' });
	await expect(open).toHaveCount(1);
	await expect(list(page).getByRole('listitem').filter({ hasText: 'WEEKLY' })).toHaveCount(2);
});

test('undoing a recurring task removes the copy it created', async ({ page }) => {
	await addTask(page, 'stretch', await day(page, 0), 'daily');
	await page.getByRole('checkbox', { name: 'Mark "stretch" as done' }).click();
	await expect(list(page).getByText('stretch')).toHaveCount(2);
	await page.getByRole('checkbox', { name: 'Mark "stretch" as not done' }).click();
	await expect(list(page).getByText('stretch')).toHaveCount(1);
});
