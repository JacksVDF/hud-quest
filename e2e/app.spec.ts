import { expect, test, type Locator, type Page } from '@playwright/test';

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
	await expect(page.getByText('Milestone completed: +25 XP.').last()).toBeVisible();
	await task.getByRole('checkbox', { name: 'Mark milestone "b" as done' }).click();
	await expect(page.getByText('Milestone completed: +25 XP.').last()).toBeVisible();
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
	// The last added task opened its page, so go back to the first one.
	await pager.getByRole('button', { name: 'Page 1' }).click();
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

test('a new task opens the page where it landed, unless a filter hides it', async ({ page }) => {
	for (let i = 1; i <= 10; i++) await addTask(page, `task ${String(i).padStart(2, '0')}`);
	await addTask(page, 'task 11');
	const pager = page.getByRole('navigation', { name: 'Pagination' });
	await expect(pager.getByRole('button', { name: 'Page 2' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await expect(page.getByText('task 11', { exact: true })).toBeVisible();
	await expect(page.getByText('task 01')).toHaveCount(0);

	// With a filter that hides the new task, the current page stays as it is.
	await page.getByRole('button', { name: 'Page 1' }).click();
	await page.getByRole('checkbox', { name: 'Mark "task 01" as done' }).click();
	await page.getByText('DONE', { exact: true }).click();
	await addTask(page, 'task 12');
	await expect(page.getByText('task 12')).toHaveCount(0);
	await expect(page.getByText('task 01', { exact: true })).toBeVisible();
});

test('the ADD button lines up with the inputs on desktop', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	const box = async (locator: Locator) => (await locator.boundingBox())!;
	const tagInput = page.getByLabel('TAGS_');
	const add = page.getByRole('button', { name: /^ADD >/ });
	const title = page.getByLabel('NEW_TASK_');

	const before = await box(add);
	expect(before.y).toBeCloseTo((await box(tagInput)).y, 0);
	expect(before.height).toBeCloseTo((await box(tagInput)).height, 0);
	// Same right edge as the complexity picker above it.
	const picker = await box(page.getByRole('group', { name: 'COMPLEXITY_' }).locator('.grid'));
	expect(before.x + before.width).toBeCloseTo(picker.x + picker.width, 0);

	// Notices and chips grow below the input, so the button must not move.
	await title.fill('x');
	await tagInput.fill('one');
	await tagInput.press('Enter');
	await expect(page.getByText('#one')).toBeVisible();
	const after = await box(add);
	expect(after.y).toBeCloseTo(before.y, 0);
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

test('explains when a tag is already added', async ({ page }) => {
	const tags = page.getByLabel('TAGS_');
	await tags.fill('work');
	await tags.press('Enter');
	await tags.fill('Work');
	await tags.press('Enter');
	await expect(page.getByText('#work is already added.')).toBeVisible();
	// Typing again clears the message.
	await tags.fill('h');
	await expect(page.getByText('is already added')).toHaveCount(0);
});

test('the complete control says what it does', async ({ page }) => {
	await addTask(page, 'Clear control');
	const box = page.getByRole('checkbox', { name: 'Mark "Clear control" as done' });
	await expect(box).toContainText('DO IT');
	await box.click();
	await expect(
		page.getByRole('checkbox', { name: 'Mark "Clear control" as not done' })
	).toContainText('UNDO');

	await addTask(page, 'Has steps', 'MEDIUM');
	await page.getByRole('button', { name: /SUBTASKS/ }).click();
	await page.getByLabel(/subtask/i).fill('step');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('checkbox', { name: 'Mark "Has steps" as done' })).toContainText(
		'AUTO'
	);
});

test('the banner counts down and closes by itself, and pauses on hover', async ({ page }) => {
	await addTask(page, 'Timer');
	await page.getByRole('checkbox', { name: 'Mark "Timer" as done' }).click();
	const banner = page.getByText('Task completed: +10 XP.');
	const countdown = page.getByTestId('banner-countdown');
	await expect(banner).toBeVisible();
	await expect(countdown).toHaveText('6s');

	// Hovering pauses the countdown.
	await banner.hover();
	await expect(countdown).toHaveText('||');
	await page.waitForTimeout(1500);
	await expect(countdown).toHaveText('||');

	// Moving away resumes it, and it closes on its own.
	await page.mouse.move(0, 0);
	await expect(banner).toHaveCount(0, { timeout: 10_000 });
});

test('the header stays visible while scrolling', async ({ page }) => {
	for (let i = 1; i <= 8; i++) await addTask(page, `scroll ${i}`);
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	const header = page.getByTestId('app-header');
	await expect(header).toBeInViewport({ ratio: 1 });
	expect((await header.boundingBox())!.y).toBeLessThanOrEqual(1);
	await expect(page.getByRole('button', { name: 'Toggle light/dark theme' })).toBeInViewport();
});

test('changing page scrolls back to the first task of that page', async ({ page }) => {
	for (let i = 1; i <= 12; i++) await addTask(page, `task ${String(i).padStart(2, '0')}`);
	const pager = page.getByRole('navigation', { name: 'Pagination' });
	await pager.getByRole('button', { name: 'Page 1' }).click();
	await expect(page.getByText('task 01')).toBeVisible();
	await pager.scrollIntoViewIfNeeded();
	await pager.getByRole('button', { name: 'Next page' }).click();
	const first = page.getByText('task 11', { exact: true });
	await expect(first).toBeVisible();
	await expect
		.poll(async () => (await first.boundingBox())!.y, { message: 'first task near the top' })
		.toBeLessThan(300);
	expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test('deleted tasks go to the trash, can be restored, and expire only by choice', async ({
	page
}) => {
	await addTask(page, 'Bin me');
	await page.getByRole('checkbox', { name: 'Mark "Bin me" as done' }).click();
	await expect(page.getByText('Task completed: +10 XP.')).toBeVisible();

	await page.getByRole('button', { name: 'Delete "Bin me"' }).click();
	await expect(page.getByText('Task moved to trash: -10 XP.')).toBeVisible();
	await expect(page.getByText('No tasks yet')).toBeVisible();

	// It is in the trash and survives a reload.
	await page.reload();
	await expect(page.getByText('loading…')).toHaveCount(0);
	await page.getByRole('button', { name: /_TRASH/ }).click();
	await expect(page.getByText('Bin me')).toBeVisible();
	await expect(page.getByText('30d left')).toBeVisible();

	await page.getByRole('button', { name: 'Restore "Bin me"' }).click();
	await expect(page.getByText('Task restored: +10 XP.')).toBeVisible();
	await expect(page.getByTestId('trash')).toHaveCount(0);
	await expect(page.getByRole('checkbox', { name: 'Mark "Bin me" as not done' })).toBeVisible();

	// Delete forever, one by one and all at once.
	await page.getByRole('button', { name: 'Delete "Bin me"' }).click();
	await page.getByRole('button', { name: /_TRASH/ }).click();
	await page.getByRole('button', { name: 'Delete "Bin me" forever' }).click();
	await expect(page.getByTestId('trash')).toHaveCount(0);

	await addTask(page, 'one');
	await addTask(page, 'two');
	await page.getByRole('button', { name: 'Delete "one"' }).click();
	await page.getByRole('button', { name: 'Delete "two"' }).click();
	await page.getByRole('button', { name: /_TRASH/ }).click();
	await page.getByRole('button', { name: 'EMPTY TRASH' }).click();
	await expect(page.getByTestId('trash')).toHaveCount(0);
});

test('trashed tasks keep showing their tags', async ({ page }) => {
	await page.getByLabel('NEW_TASK_').fill('Tagged');
	await page.getByLabel('TAGS_').fill('errand');
	await page.getByLabel('TAGS_').press('Enter');
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await expect(page.getByText('#errand')).toHaveCount(2); // filter chip + task tag
	await page.getByRole('button', { name: 'Delete "Tagged"' }).click();
	await page.getByRole('button', { name: /_TRASH/ }).click();
	await expect(page.getByTestId('trash').getByText('#errand')).toBeVisible();
});

for (const [label, size] of [
	['desktop', { width: 1280, height: 800 }],
	['mobile', { width: 360, height: 800 }]
] as const) {
	test(`notifications do not move the page (${label})`, async ({ page }) => {
		await page.setViewportSize(size);
		for (let i = 0; i < 10; i++) await addTask(page, `lvl ${i}`);
		const missions = page.getByRole('heading', { name: /_INBOX/ });
		// Position in the document (not the window), so scrolling does not matter.
		const top = (el: Locator) => el.evaluate((n) => n.getBoundingClientRect().top + scrollY);
		const slot = page.locator('[aria-live="polite"]').first();
		const before = {
			missions: await top(missions),
			slot: (await slot.boundingBox())!.height
		};

		// A short message, then the longest one (level up) that wraps on small screens.
		const boxes = page.getByRole('checkbox', { name: /Mark "lvl \d" as done/ });
		await boxes.first().click();
		await expect(page.getByText(/Task completed: \+10 XP\./)).toBeVisible();
		expect(await top(missions)).toBe(before.missions);

		for (let i = 1; i < 10; i++) await boxes.first().click();
		const levelUp = page.getByText(/LEVEL UP! You reached level 2/);
		await expect(levelUp).toBeVisible();
		expect(await top(missions)).toBe(before.missions);
		expect((await slot.boundingBox())!.height).toBe(before.slot);

		// And when it goes away.
		await page.getByRole('button', { name: 'Dismiss' }).last().click();
		await expect(levelUp).toHaveCount(0);
		expect(await top(missions)).toBe(before.missions);

		// Whatever the message, it fits inside the reserved slot.
		await page.getByRole('checkbox', { name: /Mark "lvl 0" as not done/ }).click();
		const reopened = page.getByText(/Task reopened: -10 XP\./);
		await expect(reopened).toBeVisible();
		const b = (await reopened.locator('xpath=..').boundingBox())!;
		const s = (await slot.boundingBox())!;
		expect(b.height).toBeLessThanOrEqual(s.height);
	});
}

test('trash rows animate when they enter, are restored and are deleted', async ({ page }) => {
	for (const t of ['alpha', 'beta', 'gamma']) await addTask(page, t);
	await page.getByRole('button', { name: 'Delete "alpha"' }).click();
	await page.getByRole('button', { name: 'Delete "beta"' }).click();
	await page.getByRole('button', { name: /_TRASH/ }).click();

	// Restoring: the row is still in the DOM mid-animation and moves to the left.
	const row = page
		.getByRole('listitem')
		.filter({ hasText: 'beta' })
		.filter({ has: page.getByRole('button', { name: /Restore/ }) });
	await page.getByRole('button', { name: 'Restore "beta"' }).click();
	const seen = await row
		.evaluate(
			(el) =>
				new Promise<{ transform: string; opacity: string }>((resolve) =>
					requestAnimationFrame(() =>
						requestAnimationFrame(() => {
							const s = getComputedStyle(el);
							resolve({ transform: s.transform, opacity: s.opacity });
						})
					)
				)
		)
		.catch(() => null);
	// Either we caught it mid-flight (moving/fading) or it was already gone; never static.
	if (seen) expect(seen.transform !== 'none' || Number(seen.opacity) < 1).toBe(true);
	await expect(row).toHaveCount(0);

	// Deleting for good removes the row after its exit animation.
	await page.getByRole('button', { name: 'Delete "alpha" forever' }).click();
	await expect(page.getByTestId('trash')).toHaveCount(0);
});
