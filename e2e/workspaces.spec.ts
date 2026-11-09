import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('loading…')).toHaveCount(0);
});

const card = (page: Page, name: string) =>
	page.getByTestId('workspace-card').filter({ hasText: name });

/** Opens a card and waits until the workspace page has replaced the home page. */
async function openCard(page: Page, name: string) {
	await card(page, name).click();
	await expect(page).toHaveURL(/\/w\//);
	await expect(page.getByTestId('workspace-name')).toHaveText(name);
}

async function createWorkspace(page: Page, name: string) {
	await page.getByLabel('NEW_WORKSPACE_').fill(name);
	await page.getByRole('button', { name: /^CREATE >/ }).click();
	// The form disappears once the limit is reached, so wait for the card instead.
	await expect(card(page, name)).toBeVisible();
}

async function addTask(page: Page, title: string) {
	await page.getByLabel('NEW_TASK_').fill(title);
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await expect(page.getByLabel('NEW_TASK_')).toHaveValue('');
}

test('the home page shows an INBOX card and the loose task list', async ({ page }) => {
	await expect(card(page, 'INBOX')).toBeVisible();
	await expect(page.getByRole('heading', { name: /_INBOX/ })).toBeVisible();
	await addTask(page, 'Loose one');
	await expect(page.getByText('Loose one')).toBeVisible();
	await expect(card(page, 'INBOX')).toContainText('1 open · 0 done');
});

test('creates a workspace, opens it, and shows its pending count', async ({ page }) => {
	await createWorkspace(page, 'Home');
	await expect(card(page, 'Home')).toContainText('0 open · 0 done');
	await openCard(page, 'Home');
	await expect(page).toHaveURL(/\/w\/[\w-]+$/);
	await expect(page.getByTestId('workspace-name')).toHaveText('Home');
	await expect(page.getByTestId('workspace-pending')).toHaveText('0 pending');
	await expect(page.getByText('No tasks here yet')).toBeVisible();

	// Tasks made inside belong to the workspace and are not in the INBOX.
	await addTask(page, 'Wash dishes');
	await addTask(page, 'Water plants');
	await expect(page.getByTestId('workspace-pending')).toHaveText('2 pending');
	await page.getByRole('checkbox', { name: 'Mark "Wash dishes" as done' }).click();
	await expect(page.getByTestId('workspace-pending')).toHaveText('1 pending');

	await page.getByRole('link', { name: /ALL WORKSPACES/ }).click();
	await expect(card(page, 'Home')).toContainText('1 open · 1 done');
	await expect(page.getByText('Wash dishes')).toHaveCount(0);
	await expect(card(page, 'INBOX')).toContainText('0 open · 0 done');
});

test('workspace names must be new, not reserved and not blank', async ({ page }) => {
	await createWorkspace(page, 'Work');
	await page.getByLabel('NEW_WORKSPACE_').fill('  work ');
	await page.getByRole('button', { name: /^CREATE >/ }).click();
	await expect(page.getByRole('status').filter({ hasText: 'already exists' })).toBeVisible();
	await page.getByLabel('NEW_WORKSPACE_').fill('inbox');
	await page.getByRole('button', { name: /^CREATE >/ }).click();
	await expect(page.getByRole('status').filter({ hasText: 'reserved' })).toBeVisible();
	await expect(page.getByTestId('workspace-card')).toHaveCount(2);
});

test('at most ten workspaces', async ({ page }) => {
	for (let i = 1; i <= 10; i++) await createWorkspace(page, `Space ${i}`);
	await expect(page.getByTestId('workspace-card')).toHaveCount(11); // + INBOX
	await expect(page.getByLabel('NEW_WORKSPACE_')).toHaveCount(0);
	await expect(page.getByText('Workspace limit reached (10)')).toBeVisible();
});

test('tasks can be created in a workspace from the home page', async ({ page }) => {
	await createWorkspace(page, 'Work');
	await page.getByLabel('NEW_TASK_').fill('Send invoice');
	await page.getByTestId('new-task-workspace').selectOption({ label: 'Work' });
	await page.getByRole('button', { name: /^ADD >/ }).click();
	await expect(page.getByText('Added to Work.')).toBeVisible();
	await expect(card(page, 'Work')).toContainText('1 open · 0 done');
	await expect(page.getByText('Send invoice')).toHaveCount(0);
});

test('moves a task between a workspace and the INBOX', async ({ page }) => {
	await createWorkspace(page, 'Work');
	await addTask(page, 'Movable');
	await page.getByRole('button', { name: 'Edit "Movable"' }).click();
	await page.getByTestId('edit-workspace').selectOption({ label: 'Work' });
	await page.getByRole('button', { name: 'SAVE' }).click();
	await expect(page.getByText('Moved to Work.')).toBeVisible();
	await expect(page.getByText('Movable')).toHaveCount(0);
	await expect(card(page, 'Work')).toContainText('1 open');

	await openCard(page, 'Work');
	await page.getByRole('button', { name: 'Edit "Movable"' }).click();
	await page.getByTestId('edit-workspace').selectOption({ label: 'INBOX' });
	await page.getByRole('button', { name: 'SAVE' }).click();
	await expect(page.getByText('Moved to INBOX.')).toBeVisible();
	await expect(page.getByText('No tasks here yet')).toBeVisible();
});

test('the INBOX card opens a focused view that cannot be renamed or deleted', async ({ page }) => {
	await addTask(page, 'In the inbox');
	await openCard(page, 'INBOX');
	await expect(page).toHaveURL(/\/w\/inbox$/);
	await expect(page.getByTestId('workspace-name')).toHaveText('INBOX');
	await expect(page.getByText('In the inbox')).toBeVisible();
	await expect(page.getByRole('button', { name: 'RENAME' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'DELETE WORKSPACE' })).toHaveCount(0);
});

test('renames a workspace and refuses a taken name', async ({ page }) => {
	await createWorkspace(page, 'Work');
	await createWorkspace(page, 'Home');
	await openCard(page, 'Work');
	await page.getByRole('button', { name: 'RENAME' }).click();
	await page.getByLabel('WORKSPACE_NAME_').fill('home');
	await page.getByRole('button', { name: 'SAVE' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'already exists' })).toBeVisible();
	await page.getByLabel('WORKSPACE_NAME_').fill('Job');
	await page.getByRole('button', { name: 'SAVE' }).click();
	await expect(page.getByTestId('workspace-name')).toHaveText('Job');
	await page.reload();
	await expect(page.getByTestId('workspace-name')).toHaveText('Job');
});

test('deleting a workspace asks first, sends its tasks to the trash, and removes their XP', async ({
	page
}) => {
	await createWorkspace(page, 'Work');
	await openCard(page, 'Work');
	await addTask(page, 'Done thing');
	await addTask(page, 'Open thing');
	await page.getByRole('checkbox', { name: 'Mark "Done thing" as done' }).click();
	await expect(page.getByText('Task completed: +10 XP.')).toBeVisible();

	await page.getByRole('button', { name: 'DELETE WORKSPACE' }).click();
	await expect(page.getByRole('alertdialog')).toContainText('Delete Work?');
	// Cancelling keeps everything.
	await page.getByRole('button', { name: 'CANCEL' }).click();
	await expect(page.getByTestId('workspace-name')).toHaveText('Work');

	await page.getByRole('button', { name: 'DELETE WORKSPACE' }).click();
	await page.getByRole('button', { name: 'YES, DELETE' }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByText(/Work deleted\. 2 tasks moved to trash: -10 XP\./)).toBeVisible();
	await expect(card(page, 'Work')).toHaveCount(0);

	// The trash says where they came from.
	await page.getByRole('button', { name: /_TRASH/ }).click();
	const trash = page.getByTestId('trash');
	await expect(trash).toContainText('Done thing');
	await expect(trash).toContainText('from Work');

	// Restoring a task whose workspace is gone puts it in the INBOX, and its XP comes back.
	await page.getByRole('button', { name: 'Restore "Done thing"' }).click();
	await expect(page.getByText('Task restored: +10 XP.')).toBeVisible();
	await expect(page.getByRole('heading', { name: /_INBOX/ })).toBeVisible();
	await expect(card(page, 'INBOX')).toContainText('0 open · 1 done');
});

test('restoring from the trash returns a task to its workspace when it still exists', async ({
	page
}) => {
	await createWorkspace(page, 'Work');
	await openCard(page, 'Work');
	await addTask(page, 'Brief me');
	await page.getByRole('button', { name: 'Delete "Brief me"' }).click();
	await page.getByRole('link', { name: /ALL WORKSPACES/ }).click();
	await page.getByRole('button', { name: /_TRASH/ }).click();
	await expect(page.getByTestId('trash')).toContainText('from Work');
	await page.getByRole('button', { name: 'Restore "Brief me"' }).click();
	await expect(card(page, 'Work')).toContainText('1 open');
	await expect(page.getByText('Brief me')).toHaveCount(0);
});

test('XP and level are global: the same card shows in every workspace', async ({ page }) => {
	await createWorkspace(page, 'Work');
	await addTask(page, 'Inbox task');
	await page.getByRole('checkbox', { name: 'Mark "Inbox task" as done' }).click();
	await expect(page.getByText('Task completed: +10 XP.')).toBeVisible();
	await openCard(page, 'Work');
	await expect(page.getByRole('region', { name: 'Level progress' })).toContainText('10');
	await addTask(page, 'Work task');
	await page.getByRole('checkbox', { name: 'Mark "Work task" as done' }).click();
	await expect(page.getByRole('region', { name: 'Level progress' })).toContainText('20');
});

test('pages hold ten tasks in a workspace and in the trash', async ({ page }) => {
	await createWorkspace(page, 'Big');
	await openCard(page, 'Big');
	for (let i = 1; i <= 12; i++) await addTask(page, `big ${String(i).padStart(2, '0')}`);
	const pager = page.getByRole('navigation', { name: 'Pagination' });
	await expect(pager.getByRole('button', { name: 'Page 2' })).toBeVisible();
	await expect(page.getByText('big 11')).toBeVisible();
	await expect(page.getByText('big 02')).toHaveCount(0);

	// Delete the workspace: 12 trashed tasks, ten per trash page.
	await page.getByRole('button', { name: 'DELETE WORKSPACE' }).click();
	await page.getByRole('button', { name: 'YES, DELETE' }).click();
	await page.getByRole('button', { name: /_TRASH/ }).click();
	const trashPager = page.getByRole('navigation', { name: 'Trash pagination' });
	await expect(trashPager.getByRole('button', { name: 'Page 2' })).toBeVisible();
	await expect(
		page.getByTestId('trash').getByRole('listitem').filter({ hasText: /^big/ })
	).toHaveCount(10);
	await trashPager.getByRole('button', { name: 'Next page' }).click();
	await expect(page.getByTestId('trash').getByText('from Big')).toHaveCount(2);
});

test('an unknown workspace goes back to the start', async ({ page }) => {
	await page.goto('/w/does-not-exist');
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByTestId('workspace-card').first()).toBeVisible();
});

test('workspaces and their tasks survive a reload', async ({ page }) => {
	await createWorkspace(page, 'Keep');
	await openCard(page, 'Keep');
	await addTask(page, 'Still here');
	await page.reload();
	await expect(page.getByTestId('workspace-name')).toHaveText('Keep');
	await expect(page.getByText('Still here')).toBeVisible();
});

test('guests who saved the old plain list still see their tasks in the INBOX', async ({ page }) => {
	await page.evaluate(() =>
		localStorage.setItem(
			'hud-quest-todo:tasks',
			JSON.stringify([
				{
					id: 'old1',
					title: 'From before',
					complexity: 'easy',
					done: false,
					tags: [],
					items: [],
					notes: ''
				}
			])
		)
	);
	await page.reload();
	await expect(page.getByText('From before')).toBeVisible();
	await expect(card(page, 'INBOX')).toContainText('1 open');
});
