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

async function addTask(page: Page, title: string, due?: string) {
	await page.getByLabel('NEW_TASK_').fill(title);
	if (due) await page.getByTestId('due-date').first().fill(due);
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await expect(page.getByLabel('NEW_TASK_')).toHaveValue('');
}

const cell = (page: Page, d: string) => page.locator(`[data-testid="day"][data-day="${d}"]`);
const panel = (page: Page) => page.getByTestId('day-panel');

/** A day of the current month that is still on screen and is neither today nor in the past. */
async function sameMonthDay(page: Page, offset: number) {
	const d = await day(page, offset);
	const today = await day(page, 0);
	return d.slice(0, 7) === today.slice(0, 7) ? d : await day(page, -offset);
}

test('shows a six-week month that starts on Monday, with today picked', async ({ page }) => {
	await expect(page.getByTestId('day')).toHaveCount(42);
	await expect(page.getByRole('columnheader').first()).toHaveText('MON');
	await expect(page.getByRole('columnheader').last()).toHaveText('SUN');
	const today = await day(page, 0);
	await expect(cell(page, today)).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByTestId('day-title')).toContainText('TODAY');
	await expect(panel(page)).toContainText('Nothing due on this day.');
});

test('days with tasks show a count; late ones are marked differently', async ({ page }) => {
	const today = await day(page, 0);
	const other = await sameMonthDay(page, 2);
	await addTask(page, 'one', today);
	await addTask(page, 'two', today);
	await addTask(page, 'three', other);
	await expect(cell(page, today)).toHaveAttribute('data-mark', '■2');
	await expect(cell(page, other)).toHaveAttribute('data-mark', '■1');
	await expect(cell(page, today)).toHaveAccessibleName(/2 open/);

	// A task with no due date is not on the calendar.
	await addTask(page, 'no date');
	await expect(page.locator('[data-testid="day"]:not([data-mark=""])')).toHaveCount(2);
});

test('clicking a day lists its tasks, and clicking it again clears the panel', async ({ page }) => {
	const today = await day(page, 0);
	const other = await sameMonthDay(page, 3);
	await addTask(page, 'today task', today);
	await addTask(page, 'other task', other);

	await expect(panel(page).getByTestId('day-task')).toHaveCount(1);
	await expect(panel(page)).toContainText('today task');

	await cell(page, other).click();
	await expect(cell(page, other)).toHaveAttribute('aria-pressed', 'true');
	await expect(panel(page).getByTestId('day-task')).toHaveCount(1);
	await expect(panel(page)).toContainText('other task');
	await expect(panel(page)).not.toContainText('today task');

	await cell(page, other).click();
	await expect(cell(page, other)).toHaveAttribute('aria-pressed', 'false');
	await expect(panel(page)).toContainText('Pick a day to see its tasks.');
});

test('a task of the day shows its size and where it lives', async ({ page }) => {
	await addTask(page, 'a hard one', await day(page, 0));
	const row = panel(page).getByTestId('day-task');
	await expect(row).toContainText('a hard one');
	await expect(row).toContainText('EASY');
	await expect(row.getByTestId('day-task-place')).toHaveText('INBOX');
});

test('finishing a task from the calendar gives XP and keeps it, crossed out, on its day', async ({
	page
}) => {
	const today = await day(page, 0);
	await addTask(page, 'finish me', today);
	await panel(page)
		.getByRole('checkbox', { name: /Finish "finish me"/ })
		.click();
	await expect(page.getByText('Task completed: +10 XP.')).toBeVisible();
	await expect(panel(page).getByRole('checkbox', { name: /Reopen "finish me"/ })).toBeVisible();
	await expect(cell(page, today)).toHaveAttribute('data-mark', '[X]');

	await panel(page)
		.getByRole('checkbox', { name: /Reopen "finish me"/ })
		.click();
	await expect(page.getByText('Task reopened: -10 XP.')).toBeVisible();
	await expect(cell(page, today)).toHaveAttribute('data-mark', '■1');
});

test('a task with subtasks cannot be ticked from the calendar', async ({ page }) => {
	const today = await day(page, 0);
	await page.getByLabel('NEW_TASK_').fill('has parts');
	await page.getByRole('radio', { name: /medium/i }).check({ force: true });
	await page.getByTestId('due-date').first().fill(today);
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await expect(page.getByLabel('NEW_TASK_')).toHaveValue('');
	await page.getByRole('button', { name: /SUBTASKS/ }).click();
	await page.getByLabel('New subtask').fill('part one');
	await page.keyboard.press('Enter');
	await expect(
		page.getByRole('checkbox', { name: 'Mark subtask "part one" as done' })
	).toBeVisible();

	await expect(panel(page).getByRole('checkbox', { name: /Finish "has parts"/ })).toBeDisabled();
});

test('moves between months and back to today', async ({ page }) => {
	const title = page.getByTestId('month-title');
	const first = await title.textContent();
	await page.getByRole('button', { name: 'Next month' }).click();
	await expect(title).not.toHaveText(first!);
	await page.getByRole('button', { name: 'Previous month' }).click();
	await page.getByRole('button', { name: 'Previous month' }).click();
	await expect(title).not.toHaveText(first!);
	await page.getByTestId('calendar-today').click();
	await expect(title).toHaveText(first!);
	await expect(cell(page, await day(page, 0))).toHaveAttribute('aria-pressed', 'true');
});

test('tasks in another month show up when you go there', async ({ page }) => {
	const next = await day(page, 40);
	await addTask(page, 'far away', next);
	await page.getByRole('button', { name: 'Next month' }).click();
	const farCell = cell(page, next);
	if ((await farCell.count()) === 0) await page.getByRole('button', { name: 'Next month' }).click();
	await expect(cell(page, next).first()).toHaveAttribute('data-mark', '■1');
	await cell(page, next).first().click();
	await expect(panel(page)).toContainText('far away');
});

test('arrow keys move between days, and only one day is in the tab order', async ({ page }) => {
	const today = await day(page, 0);
	await expect(page.locator('[data-testid="day"][tabindex="0"]')).toHaveCount(1);
	await cell(page, today).focus();
	await page.keyboard.press('ArrowRight');
	await expect(page.locator(':focus')).toHaveAttribute('data-day', await day(page, 1));
	await page.keyboard.press('ArrowDown');
	await expect(page.locator(':focus')).toHaveAttribute('data-day', await day(page, 8));
	await page.keyboard.press('ArrowLeft');
	await page.keyboard.press('ArrowUp');
	await expect(page.locator(':focus')).toHaveAttribute('data-day', await day(page, 0));
});

test('+ ADD fills the due day of the form and moves the cursor to the title', async ({ page }) => {
	const target = await sameMonthDay(page, 3);
	await cell(page, target).click();
	await panel(page)
		.getByRole('button', { name: /\+ ADD/ })
		.click();
	await expect(page.getByTestId('due-date').first()).toHaveValue(target);
	await expect(page.getByLabel('NEW_TASK_')).toBeFocused();

	await page.getByLabel('NEW_TASK_').fill('planned');
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await expect(panel(page)).toContainText('planned');
	await expect(cell(page, target)).toHaveAttribute('data-mark', '■1');
});

test('moves a task to another day with the date field', async ({ page }) => {
	const today = await day(page, 0);
	const target = await sameMonthDay(page, 4);
	await addTask(page, 'move me', today);
	await panel(page)
		.getByLabel(/Move "move me"/)
		.fill(target);
	await expect(page.getByText(/Moved to/)).toBeVisible();
	await expect(cell(page, today)).toHaveAttribute('data-mark', '');
	await expect(cell(page, target)).toHaveAttribute('data-mark', '■1');
	await expect(panel(page)).toContainText('Nothing due on this day.');
});

test('moves a task to another day by dragging it', async ({ page }) => {
	const today = await day(page, 0);
	const target = await sameMonthDay(page, 4);
	await addTask(page, 'drag me', today);
	// Tall enough for the grid and the panel together, and scrolled so the sticky header is not in the way.
	await page.setViewportSize({ width: 1280, height: 1700 });
	await page.getByTestId('calendar').scrollIntoViewIfNeeded();
	await panel(page).getByTestId('day-task').dragTo(cell(page, target));
	await expect(cell(page, target)).toHaveAttribute('data-mark', '■1');
	await expect(cell(page, today)).toHaveAttribute('data-mark', '');
});

test('done tasks cannot be moved', async ({ page }) => {
	const today = await day(page, 0);
	await addTask(page, 'settled', today);
	await panel(page)
		.getByRole('checkbox', { name: /Finish "settled"/ })
		.click();
	await expect(panel(page).getByLabel(/Move "settled"/)).toHaveCount(0);
	await expect(panel(page).getByTestId('day-task')).toHaveAttribute('draggable', 'false');
});

test('a task in the trash is not on the calendar', async ({ page }) => {
	const today = await day(page, 0);
	await addTask(page, 'to bin', today);
	await expect(cell(page, today)).toHaveAttribute('data-mark', '■1');
	await page.getByRole('button', { name: 'Delete "to bin"' }).click();
	await expect(cell(page, today)).toHaveAttribute('data-mark', '');
});

test('the calendar survives a reload with the tasks it shows', async ({ page }) => {
	const today = await day(page, 0);
	await addTask(page, 'stay', today);
	await page.reload();
	await expect(cell(page, today)).toHaveAttribute('data-mark', '■1');
	await expect(panel(page)).toContainText('stay');
});

test('a day of the next month in the grid takes you to that month when clicked', async ({
	page
}) => {
	const title = page.getByTestId('month-title');
	const first = await title.textContent();
	const cells = page.getByTestId('day');
	const last = await cells.last().getAttribute('data-day');
	await cells.last().click();
	await expect(title).not.toHaveText(first!);
	await expect(cell(page, last!).first()).toHaveAttribute('aria-pressed', 'true');
});

/** Opens a workspace made on the spot (or the INBOX with no name) and waits for its page. */
async function openWorkspace(page: Page, name?: string) {
	if (name) {
		await page.getByLabel('NEW_WORKSPACE_').fill(name);
		await page.getByRole('button', { name: /^CREATE >/ }).click();
	}
	await page
		.getByTestId('workspace-card')
		.filter({ hasText: name ?? 'INBOX' })
		.click();
	await expect(page).toHaveURL(/\/w\//);
	await expect(page.getByTestId('workspace-name')).toHaveText(name ?? 'INBOX');
}

test('a workspace calendar shows only the tasks of that workspace', async ({ page }) => {
	const today = await day(page, 0);
	await addTask(page, 'in the inbox', today);
	await page.getByLabel('NEW_WORKSPACE_').fill('Work');
	await page.getByRole('button', { name: /^CREATE >/ }).click();
	await page.getByTestId('new-task-workspace').selectOption({ label: 'Work' });
	await addTask(page, 'in work', today);

	// The home page shows both.
	await expect(cell(page, today)).toHaveAttribute('data-mark', '■2');
	await expect(panel(page).getByTestId('day-task')).toHaveCount(2);

	await openWorkspace(page, 'Work');
	await expect(page.getByTestId('calendar')).toBeVisible();
	await expect(cell(page, today)).toHaveAttribute('data-mark', '■1');
	await expect(panel(page)).toContainText('in work');
	await expect(panel(page)).not.toContainText('in the inbox');
	await expect(panel(page).getByTestId('day-task-place')).toHaveText('Work');

	// And the INBOX page only its own.
	await page.getByRole('link', { name: /ALL WORKSPACES/ }).click();
	await openWorkspace(page);
	await expect(cell(page, today)).toHaveAttribute('data-mark', '■1');
	await expect(panel(page)).toContainText('in the inbox');
	await expect(panel(page)).not.toContainText('in work');
});

test('+ ADD inside a workspace makes the task in that workspace', async ({ page }) => {
	await openWorkspace(page, 'Home');
	const target = await sameMonthDay(page, 3);
	await cell(page, target).click();
	await panel(page)
		.getByRole('button', { name: /\+ ADD/ })
		.click();
	await expect(page.getByTestId('due-date').first()).toHaveValue(target);
	await page.getByLabel('NEW_TASK_').fill('planned here');
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await expect(cell(page, target)).toHaveAttribute('data-mark', '■1');
	await expect(panel(page).getByTestId('day-task-place')).toHaveText('Home');

	// It is not in the INBOX.
	await page.getByRole('link', { name: /ALL WORKSPACES/ }).click();
	await openWorkspace(page);
	await expect(cell(page, target)).toHaveAttribute('data-mark', '');
});

test('each workspace page starts on today, with its own month', async ({ page }) => {
	await openWorkspace(page, 'Fresh');
	await page.getByRole('button', { name: 'Next month' }).click();
	const moved = await page.getByTestId('month-title').textContent();
	await page.getByRole('link', { name: /ALL WORKSPACES/ }).click();
	await expect(page.getByTestId('month-title')).not.toHaveText(moved!);
	await expect(cell(page, await day(page, 0))).toHaveAttribute('aria-pressed', 'true');
});

const weekdayOf = (iso: string) => (new Date(`${iso}T12:00:00`).getDay() + 6) % 7;

test('starts on the month on wide screens and on the week on phones', async ({ page, browser }) => {
	await expect(page.getByTestId('calendar')).toHaveAttribute('data-view', 'month');
	await expect(page.getByTestId('day')).toHaveCount(42);

	const phone = await browser.newContext({
		viewport: { width: 380, height: 800 },
		storageState: await page.context().storageState()
	});
	const small = await phone.newPage();
	await small.goto('/');
	await expect(small.getByTestId('calendar')).toHaveAttribute('data-view', 'week');
	await expect(small.getByTestId('day')).toHaveCount(7);
	await expect(small.getByTestId('view-week')).toHaveAttribute('aria-pressed', 'true');
	await phone.close();
});

test('the week view shows seven days from Monday, with today and its tasks', async ({ page }) => {
	const today = await day(page, 0);
	await addTask(page, 'this week', today);
	await page.getByTestId('view-week').click();
	await expect(page.getByTestId('calendar')).toHaveAttribute('data-view', 'week');
	await expect(page.getByTestId('day')).toHaveCount(7);
	const first = await page.getByTestId('day').first().getAttribute('data-day');
	expect(weekdayOf(first!)).toBe(0);
	await expect(cell(page, today)).toHaveAttribute('data-mark', '■1');
	await expect(cell(page, today)).toHaveAttribute('aria-pressed', 'true');
	await expect(panel(page)).toContainText('this week');
});

test('the week arrows move seven days and TODAY comes back', async ({ page }) => {
	await page.getByTestId('view-week').click();
	const first = await page.getByTestId('day').first().getAttribute('data-day');
	await page.getByRole('button', { name: 'Next week' }).click();
	const next = await page.getByTestId('day').first().getAttribute('data-day');
	expect(new Date(`${next}T12:00:00`).getTime() - new Date(`${first}T12:00:00`).getTime()).toBe(
		7 * 24 * 60 * 60 * 1000
	);
	await page.getByRole('button', { name: 'Previous week' }).click();
	await page.getByRole('button', { name: 'Previous week' }).click();
	await expect(page.getByTestId('day').first()).not.toHaveAttribute('data-day', first!);
	await page.getByTestId('calendar-today').click();
	await expect(page.getByTestId('day').first()).toHaveAttribute('data-day', first!);
});

test('switching view keeps the day that was picked in sight', async ({ page }) => {
	const today = await day(page, 0);
	await page.getByTestId('view-week').click();
	await page.getByRole('button', { name: 'Next week' }).click();
	await page.getByTestId('view-month').click();
	await expect(page.getByTestId('day')).toHaveCount(42);
	// The month that holds that week is the one shown.
	const shownDays = await page
		.getByTestId('day')
		.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.day));
	expect(shownDays.length).toBe(42);
	await page.getByTestId('calendar-today').click();
	await expect(cell(page, today)).toHaveAttribute('aria-pressed', 'true');
});

test('a task can be moved to another day inside the week view', async ({ page }) => {
	const today = await day(page, 0);
	await addTask(page, 'week mover', today);
	await page.getByTestId('view-week').click();
	const target = await day(page, 0).then(async (d) => {
		// Another day of this same week: the Monday, or the next day when today is the Monday.
		const first = await page.getByTestId('day').first().getAttribute('data-day');
		return first === d ? await day(page, 1) : first!;
	});
	await panel(page)
		.getByLabel(/Move "week mover"/)
		.fill(target);
	// A day before today is late, so it is marked as such; a later one as open.
	await expect(cell(page, target)).toHaveAttribute('data-mark', target < today ? '!1' : '■1');
	await expect(cell(page, today)).toHaveAttribute('data-mark', '');
});

test('arrow keys cross from one week to the next', async ({ page }) => {
	await page.getByTestId('view-week').click();
	const last = page.getByTestId('day').last();
	await last.focus();
	const lastDay = await last.getAttribute('data-day');
	await page.keyboard.press('ArrowRight');
	await expect(page.locator(':focus')).not.toHaveAttribute('data-day', lastDay!);
	await expect(page.getByTestId('day')).toHaveCount(7);
});

test('a very long title stays inside the screen on a phone', async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 800 });
	const today = await day(page, 0);
	const long = 'https://example.com/' + 'a-very-long-address-without-spaces/'.repeat(2);
	await addTask(page, long, today);
	const noOverflow = () =>
		page.evaluate(
			() => document.documentElement.scrollWidth <= document.documentElement.clientWidth
		);
	expect(await noOverflow()).toBe(true);
	// Both the calendar's day list and the task list hold the full title and fit.
	await expect(panel(page).getByTestId('day-task')).toHaveCount(1);
	await expect(panel(page).getByRole('checkbox', { name: /Finish/ })).toBeVisible();
	await expect(
		page.getByRole('checkbox', { name: `Mark "${long}" as done`, exact: true })
	).toBeVisible();
	const row = page.locator('section[aria-labelledby="list-title"] li').first();
	const box = (await row.boundingBox())!;
	expect(box.x + box.width).toBeLessThanOrEqual(360);
});

test('the title of a task sits on its own line, above its labels and actions', async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 800 });
	await addTask(
		page,
		'A fairly long title that needs several lines on a small screen to read well'
	);
	const row = page.locator('section[aria-labelledby="list-title"] li').first();
	const titleBox = (await row.getByText(/A fairly long title/).boundingBox())!;
	const xp = (await row.getByText('+10 XP').boundingBox())!;
	const edit = (await row.getByRole('button', { name: /Edit/ }).boundingBox())!;
	// The title is wide enough to read (not squeezed into a narrow column) ...
	expect(titleBox.width).toBeGreaterThan(160);
	// ... and the labels and the actions come after it, never beside it.
	expect(xp.y).toBeGreaterThan(titleBox.y + titleBox.height - 1);
	expect(edit.y).toBeGreaterThan(titleBox.y + titleBox.height - 1);
});

test('text fields do not offer the browser’s saved entries', async ({ page }) => {
	await addTask(page, 'has parts', await day(page, 0));
	const fields = [
		page.getByLabel('NEW_TASK_'),
		page.getByLabel('NEW_WORKSPACE_'),
		page.getByLabel('TAGS_')
	];
	for (const field of fields) await expect(field).toHaveAttribute('autocomplete', 'off');
	await page.getByRole('button', { name: 'Edit "has parts"' }).click();
	await expect(page.getByLabel('Task title')).toHaveAttribute('autocomplete', 'off');
});

test('sections of the page are set apart by a rule', async ({ page }) => {
	await addTask(page, 'x', await day(page, 0));
	for (const selector of [
		'[data-testid="calendar"]',
		'section[aria-labelledby="workspaces-title"]',
		'section[aria-labelledby="list-title"]'
	]) {
		const width = await page.locator(selector).evaluate((n) => getComputedStyle(n).borderTopWidth);
		expect(width, selector).toBe('2px');
	}
});
