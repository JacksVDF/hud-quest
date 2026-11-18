import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// A little of everything, so the scan sees an overdue repeating task, a project, a workspace,
// a trashed task and a streak.
const today = () => {
	const d = new Date();
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const seed = () => ({
	workspaces: [{ id: 'w1', name: 'Work' }],
	activity: { [today()]: { easy: 2, medium: 0, hard: 0, xp: 20 } },
	tasks: [
		{
			id: 'a',
			title: 'Easy late',
			complexity: 'easy',
			done: false,
			tags: ['home'],
			items: [],
			notes: '',
			dueDate: '2020-01-01',
			repeat: 'daily'
		},
		{
			id: 'b',
			title: 'Medium',
			complexity: 'medium',
			done: false,
			tags: [],
			items: [{ id: 'i', title: 'sub', done: false }],
			notes: ''
		},
		{
			id: 'c',
			title: 'Hard',
			complexity: 'hard',
			done: true,
			tags: [],
			items: [{ id: 'j', title: 'm', done: true }],
			notes: 'x',
			workspaceId: 'w1'
		},
		// Due today (one open, one done) so the calendar has marked days and a list for today.
		{
			id: 'e',
			title: 'Due today',
			complexity: 'easy',
			done: false,
			tags: [],
			items: [],
			notes: '',
			dueDate: today()
		},
		{
			id: 'f',
			title: 'Done today',
			complexity: 'easy',
			done: true,
			tags: [],
			items: [],
			notes: '',
			dueDate: today(),
			workspaceId: 'w1'
		},
		{
			id: 'd',
			title: 'Binned',
			complexity: 'easy',
			done: false,
			tags: [],
			items: [],
			notes: '',
			deletedAt: Date.now()
		}
	]
});

const PAGES = ['/', '/w/w1', '/stats', '/login', '/signup', '/account', '/missing'];

for (const theme of ['light', 'dark'] as const) {
	for (const path of PAGES) {
		test(`no accessibility violations on ${path} (${theme})`, async ({ page }) => {
			await page.addInitScript(
				([t, data]) => {
					localStorage.setItem('hud-quest-todo:theme', t);
					localStorage.setItem('hud-quest-todo:tasks', JSON.stringify(data));
				},
				[theme, seed()] as const
			);
			await page.goto(path);
			await expect(page.getByText('loading…')).toHaveCount(0);
			// Let the entrance animations finish: axe reads colours while they are still fading in.
			await page.waitForTimeout(1000);
			const result = await new AxeBuilder({ page })
				.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
				// Agreed to be left as it is: visible text and accessible name differ on a few buttons.
				.disableRules(['label-content-name-mismatch'])
				.analyze();
			expect(
				result.violations.map(
					(v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`
				)
			).toEqual([]);
		});
	}
}

test('the whole app can be used from the keyboard: add, complete and reach the stats', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.getByText('loading…')).toHaveCount(0);
	await page.getByLabel('NEW_TASK_').focus();
	await page.keyboard.type('Keyboard only');
	await page.keyboard.press('Enter');
	await expect(page.getByLabel('NEW_TASK_')).toHaveValue('');
	const done = page.getByRole('checkbox', { name: 'Mark "Keyboard only" as done' });
	await done.focus();
	await page.keyboard.press('Enter');
	await expect(
		page.getByRole('checkbox', { name: 'Mark "Keyboard only" as not done' })
	).toBeVisible();
	await page.getByTestId('streak').focus();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/stats$/);
});

test('every control that takes the focus shows a visible outline', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('loading…')).toHaveCount(0);
	await page.getByLabel('NEW_TASK_').fill('focus me');
	await page.keyboard.press('Enter');
	const seen = new Set<string>();
	for (let i = 0; i < 12; i++) {
		await page.keyboard.press('Tab');
		const outline = await page.evaluate(() => {
			const el = document.activeElement;
			if (!el || el === document.body) return null;
			const s = getComputedStyle(el);
			return { width: s.outlineWidth, style: s.outlineStyle, tag: el.tagName };
		});
		if (!outline) continue;
		seen.add(outline.tag);
		// The radio inputs are hidden and show the focus on their label instead.
		if (outline.tag === 'INPUT') continue;
		expect(outline.style, `${outline.tag} has an outline`).not.toBe('none');
		expect(parseFloat(outline.width)).toBeGreaterThanOrEqual(2);
	}
	expect(seen.size).toBeGreaterThan(1);
});
