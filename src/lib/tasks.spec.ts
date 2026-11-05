import { describe, expect, it } from 'vitest';
import {
	addTag,
	allTags,
	canMarkDone,
	filterTasks,
	normalizeTag,
	parseTasks,
	reconcileDone,
	taskXp,
	toTasks,
	totalXp,
	type Item,
	type Task
} from './tasks';

const item = (id: string, done = false): Item => ({ id, title: id, done });

const task = (over: Partial<Task> = {}): Task => ({
	id: '1',
	title: 'Test',
	complexity: 'easy',
	done: false,
	tags: [],
	items: [],
	notes: '',
	...over
});

describe('totalXp', () => {
	it('counts only completed tasks', () => {
		const tasks = [
			task({ id: '1', complexity: 'easy', done: true }),
			task({ id: '2', complexity: 'hard', done: true }),
			task({ id: '3', complexity: 'medium', done: false })
		];
		expect(totalXp(tasks)).toBe(60);
	});

	it('drops XP when a task is un-completed', () => {
		const t = task({ complexity: 'medium', done: true });
		expect(totalXp([t])).toBe(25);
		expect(totalXp([{ ...t, done: false }])).toBe(0);
	});
});

describe('taskXp', () => {
	it('gives subtasks no XP of their own', () => {
		const t = task({ complexity: 'medium', items: [item('a', true), item('b', false)] });
		expect(taskXp(t)).toBe(0);
	});

	it('gives the full medium XP once the parent is done', () => {
		const t = task({ complexity: 'medium', done: true, items: [item('a', true)] });
		expect(taskXp(t)).toBe(25);
	});

	it('releases hard-project XP proportionally with floor', () => {
		const items = [item('a'), item('b'), item('c')];
		const hard = (n: number) =>
			task({
				complexity: 'hard',
				items: items.map((i, idx) => ({ ...i, done: idx < n }))
			});
		expect(taskXp(hard(0))).toBe(0);
		expect(taskXp(hard(1))).toBe(16);
		expect(taskXp(hard(2))).toBe(33);
		expect(taskXp(hard(3))).toBe(50);
	});

	it('removes milestone XP again when a milestone is un-checked', () => {
		const items = [item('a', true), item('b', true)];
		expect(taskXp(task({ complexity: 'hard', items }))).toBe(50);
		expect(
			taskXp(task({ complexity: 'hard', items: [items[0], { ...items[1], done: false }] }))
		).toBe(25);
	});

	it('treats a hard task without milestones like a plain task', () => {
		expect(taskXp(task({ complexity: 'hard', done: true }))).toBe(50);
		expect(taskXp(task({ complexity: 'hard', done: false }))).toBe(0);
	});
});

describe('canMarkDone', () => {
	it('always allows easy tasks', () => {
		expect(canMarkDone(task())).toBe(true);
	});

	it('allows ticking a task that has no subtasks or milestones', () => {
		expect(canMarkDone(task({ complexity: 'medium' }))).toBe(true);
		expect(canMarkDone(task({ complexity: 'hard' }))).toBe(true);
	});

	it('locks the checkbox of a medium task with subtasks (it closes itself)', () => {
		expect(canMarkDone(task({ complexity: 'medium', items: [item('a', true)] }))).toBe(false);
		expect(canMarkDone(task({ complexity: 'medium', items: [item('a', true), item('b')] }))).toBe(
			false
		);
	});

	it('locks the checkbox of a hard project that has milestones', () => {
		expect(canMarkDone(task({ complexity: 'hard', items: [item('a')] }))).toBe(false);
	});
});

describe('reconcileDone (auto-close)', () => {
	it('closes a medium task as soon as its last subtask is done', () => {
		const t = task({
			complexity: 'medium',
			done: false,
			items: [item('a', true), item('b', true)]
		});
		expect(reconcileDone(t)).toBe(true);
	});

	it('reopens a done medium task when a subtask is unchecked or added', () => {
		const t = task({ complexity: 'medium', done: true, items: [item('a', true), item('b')] });
		expect(reconcileDone(t)).toBe(false);
	});

	it('gives a medium task its full XP only when every subtask is done', () => {
		const items = [item('a', true), item('b')];
		const open = task({ complexity: 'medium', items });
		expect(taskXp({ ...open, done: reconcileDone(open) })).toBe(0);
		const closed = task({ complexity: 'medium', items: items.map((i) => ({ ...i, done: true })) });
		expect(taskXp({ ...closed, done: reconcileDone(closed) })).toBe(25);
	});

	it('keeps the manual value when there are no items', () => {
		expect(reconcileDone(task({ complexity: 'medium', done: true }))).toBe(true);
		expect(reconcileDone(task({ complexity: 'medium', done: false }))).toBe(false);
	});

	it('derives hard-project completion from its milestones', () => {
		expect(
			reconcileDone(task({ complexity: 'hard', items: [item('a', true), item('b', true)] }))
		).toBe(true);
		expect(
			reconcileDone(task({ complexity: 'hard', done: true, items: [item('a', true), item('b')] }))
		).toBe(false);
	});
});

describe('tags', () => {
	it('lowercases, trims and caps at 20 characters', () => {
		expect(normalizeTag('  Work  ')).toBe('work');
		expect(normalizeTag('Deep   Focus')).toBe('deep focus');
		expect(normalizeTag('x'.repeat(30))).toHaveLength(20);
	});

	it('ignores empty and duplicate tags', () => {
		expect(addTag([], '   ')).toEqual([]);
		expect(addTag(['home'], 'HOME')).toEqual(['home']);
	});

	it('allows at most 3 tags', () => {
		const tags = ['a', 'b', 'c'];
		expect(addTag(tags, 'd')).toEqual(tags);
		expect(addTag(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
	});

	it('lists unique sorted tags across tasks', () => {
		const tasks = [task({ tags: ['work', 'home'] }), task({ id: '2', tags: ['home', 'gym'] })];
		expect(allTags(tasks)).toEqual(['gym', 'home', 'work']);
	});
});

describe('filterTasks', () => {
	const tasks = [
		task({ id: '1', tags: ['work', 'urgent'], done: true }),
		task({ id: '2', tags: ['work'] }),
		task({ id: '3', tags: ['home'] })
	];
	const ids = (list: Task[]) => list.map((t) => t.id);

	it('returns everything with no filters', () => {
		expect(ids(filterTasks(tasks, { tags: [], status: 'all' }))).toEqual(['1', '2', '3']);
	});

	it('filters by status', () => {
		expect(ids(filterTasks(tasks, { tags: [], status: 'open' }))).toEqual(['2', '3']);
		expect(ids(filterTasks(tasks, { tags: [], status: 'done' }))).toEqual(['1']);
	});

	it('requires ALL selected tags', () => {
		expect(ids(filterTasks(tasks, { tags: ['work'], status: 'all' }))).toEqual(['1', '2']);
		expect(ids(filterTasks(tasks, { tags: ['work', 'urgent'], status: 'all' }))).toEqual(['1']);
	});

	it('combines tags and status', () => {
		expect(ids(filterTasks(tasks, { tags: ['work'], status: 'open' }))).toEqual(['2']);
	});
});

describe('parseTasks', () => {
	it('returns [] for null, invalid JSON and non-arrays', () => {
		expect(parseTasks(null)).toEqual([]);
		expect(parseTasks('{oops')).toEqual([]);
		expect(parseTasks('{"a":1}')).toEqual([]);
	});

	it('keeps valid tasks and drops malformed ones', () => {
		const good = task();
		const bad = { id: 2, title: 'x', complexity: 'epic', done: false };
		expect(parseTasks(JSON.stringify([good, bad]))).toEqual([good]);
	});

	it('loads old saves without tags, items or notes', () => {
		const old = { id: 'a', title: 'Old', complexity: 'medium', done: true };
		expect(parseTasks(JSON.stringify([old]))).toEqual([{ ...old, tags: [], items: [], notes: '' }]);
	});

	it('sanitises tags and drops items on easy tasks', () => {
		const raw = {
			...task({ complexity: 'easy' }),
			tags: ['A', 'a', 'b', 'c', 'd', 5],
			items: [item('x')]
		};
		const [t] = parseTasks(JSON.stringify([raw]));
		expect(t.tags).toEqual(['a', 'b', 'c']);
		expect(t.items).toEqual([]);
	});

	it('closes a medium task on load when all its subtasks are done', () => {
		const raw = task({ complexity: 'medium', done: false, items: [item('a', true)] });
		const [t] = parseTasks(JSON.stringify([raw]));
		expect(t.done).toBe(true);
	});

	it('reconciles done flags on load', () => {
		const raw = task({ complexity: 'hard', done: true, items: [item('a', true), item('b')] });
		const [t] = parseTasks(JSON.stringify([raw]));
		expect(t.done).toBe(false);
	});
});

describe('toTasks (untrusted input)', () => {
	it('returns null when the data is not a list', () => {
		expect(toTasks({})).toBeNull();
		expect(toTasks('x')).toBeNull();
		expect(toTasks(null)).toBeNull();
	});

	it('drops invalid entries and keeps valid ones', () => {
		const result = toTasks([task({ id: 'ok' }), { id: 1 }, null]);
		expect(result?.map((t) => t.id)).toEqual(['ok']);
	});

	it('sanitizes fields: tag limits, notes only on hard tasks', () => {
		const result = toTasks([
			task({ tags: ['A', 'b', 'c', 'd'], notes: 'nope' }),
			task({ id: '2', complexity: 'hard', notes: 'x'.repeat(2000) })
		]);
		expect(result?.[0]).toMatchObject({ tags: ['a', 'b', 'c'], notes: '' });
		expect(result?.[1].notes).toHaveLength(1000);
	});
});
