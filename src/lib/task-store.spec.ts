import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY, type Task } from './tasks';
import { TaskStore } from './task-store.svelte';

function stubStorage(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => void data.set(k, v)
	});
	return data;
}

let counter = 0;

beforeEach(() => {
	counter = 0;
	vi.stubGlobal('crypto', { randomUUID: () => `id-${++counter}` });
});

function fresh(initial?: Record<string, string>) {
	const data = stubStorage(initial);
	const store = new TaskStore();
	store.load();
	return { store, data };
}

describe('TaskStore basics', () => {
	it('starts empty and loaded', () => {
		const { store } = fresh();
		expect(store.loaded).toBe(true);
		expect(store.tasks).toEqual([]);
		expect(store.xp).toBe(0);
	});

	it('adds a trimmed task with normalized tags and saves it', () => {
		const { store, data } = fresh();
		store.add('  Write report ', 'easy', [' Work ', 'work', 'Home']);
		expect(store.tasks).toHaveLength(1);
		expect(store.tasks[0]).toMatchObject({ title: 'Write report', tags: ['work', 'home'] });
		expect(JSON.parse(data.get(STORAGE_KEY) ?? '[]')).toHaveLength(1);
	});

	it('ignores blank titles', () => {
		const { store } = fresh();
		store.add('   ', 'easy');
		expect(store.tasks).toHaveLength(0);
	});

	it('restores saved tasks on load', () => {
		const { store } = fresh();
		store.add('Persist me', 'medium');
		const saved = JSON.stringify(store.tasks);
		const { store: other } = fresh({ [STORAGE_KEY]: saved });
		expect(other.tasks.map((t) => t.title)).toEqual(['Persist me']);
	});

	it('survives corrupted storage', () => {
		const { store } = fresh({ [STORAGE_KEY]: '{not json' });
		expect(store.tasks).toEqual([]);
	});
});

describe('TaskStore with a custom storage', () => {
	it('loads from and saves to the injected storage, not localStorage', () => {
		const saved: Task[][] = [];
		const seed: Task = {
			id: 's1',
			title: 'seeded',
			complexity: 'easy',
			done: false,
			tags: [],
			items: [],
			notes: ''
		};
		const store = new TaskStore({
			load: () => [seed],
			save: (t) => void saved.push(structuredClone(t))
		});
		store.load();
		expect(store.tasks.map((t) => t.title)).toEqual(['seeded']);
		store.toggle('s1');
		expect(saved).toHaveLength(1);
		expect(saved[0][0].done).toBe(true);
	});
});

describe('TaskStore XP', () => {
	it('awards XP for an easy task and removes it when reopened', () => {
		const { store } = fresh();
		store.add('a', 'easy');
		const id = store.tasks[0].id;
		const done = store.toggle(id);
		expect(done).toMatchObject({ delta: 10, done: true });
		expect(store.xp).toBe(10);
		const undone = store.toggle(id);
		expect(undone).toMatchObject({ delta: -10, done: false });
		expect(store.xp).toBe(0);
	});

	it('reports a level change', () => {
		const { store } = fresh();
		// 10 easy tasks = 100 XP = level 2
		for (let i = 0; i < 10; i++) store.add(`t${i}`, 'easy');
		let last = null;
		for (const t of store.tasks) last = store.toggle(t.id);
		expect(last).toMatchObject({ levelBefore: 1, levelAfter: 2 });
		expect(store.levelInfo.level).toBe(2);
	});

	it('removing a done task removes its XP', () => {
		const { store } = fresh();
		store.add('a', 'medium');
		const id = store.tasks[0].id;
		store.toggle(id);
		expect(store.xp).toBe(25);
		expect(store.remove(id).delta).toBe(-25);
		expect(store.tasks).toHaveLength(0);
	});
});

describe('TaskStore subtasks (medium)', () => {
	it('completes automatically when the last subtask is ticked', () => {
		const { store } = fresh();
		store.add('m', 'medium');
		const id = store.tasks[0].id;
		store.addItem(id, 'one');
		store.addItem(id, 'two');
		const [a, b] = store.tasks[0].items;
		expect(store.toggleItem(id, a.id)?.delta).toBe(0);
		expect(store.tasks[0].done).toBe(false);
		expect(store.toggleItem(id, b.id)?.delta).toBe(25);
		expect(store.tasks[0].done).toBe(true);
	});

	it('reopens when a subtask is unticked, removing the XP', () => {
		const { store } = fresh();
		store.add('m', 'medium');
		const id = store.tasks[0].id;
		store.addItem(id, 'one');
		const item = store.tasks[0].items[0];
		store.toggleItem(id, item.id);
		expect(store.xp).toBe(25);
		expect(store.toggleItem(id, item.id)?.delta).toBe(-25);
		expect(store.tasks[0].done).toBe(false);
	});

	it('cannot be toggled manually while it has subtasks', () => {
		const { store } = fresh();
		store.add('m', 'medium');
		const id = store.tasks[0].id;
		store.addItem(id, 'one');
		expect(store.toggle(id)).toBeNull();
		expect(store.xp).toBe(0);
	});

	it('adding a subtask to a completed task reopens it', () => {
		const { store } = fresh();
		store.add('m', 'medium');
		const id = store.tasks[0].id;
		store.addItem(id, 'one');
		store.toggleItem(id, store.tasks[0].items[0].id);
		expect(store.addItem(id, 'two')?.delta).toBe(-25);
	});

	it('ignores subtasks on easy tasks and blank titles', () => {
		const { store } = fresh();
		store.add('e', 'easy');
		store.add('m', 'medium');
		expect(store.addItem(store.tasks[0].id, 'x')).toBeNull();
		expect(store.addItem(store.tasks[1].id, '  ')).toBeNull();
		expect(store.tasks[0].items).toHaveLength(0);
	});
});

describe('TaskStore projects (hard)', () => {
	it('releases XP proportionally to finished milestones', () => {
		const { store } = fresh();
		store.add('p', 'hard');
		const id = store.tasks[0].id;
		for (const m of ['a', 'b', 'c', 'd']) store.addItem(id, m);
		const items = store.tasks[0].items;
		expect(store.toggleItem(id, items[0].id)?.delta).toBe(12);
		expect(store.xp).toBe(12);
		store.toggleItem(id, items[1].id);
		expect(store.xp).toBe(25);
		store.toggleItem(id, items[2].id);
		store.toggleItem(id, items[3].id);
		expect(store.xp).toBe(50);
		expect(store.tasks[0].done).toBe(true);
	});

	it('only keeps notes on hard tasks and caps their length', () => {
		const { store } = fresh();
		store.add('p', 'hard');
		store.add('m', 'medium');
		store.update(store.tasks[0].id, { notes: 'x'.repeat(1500) });
		store.update(store.tasks[1].id, { notes: 'nope' });
		expect(store.tasks[0].notes).toHaveLength(1000);
		expect(store.tasks[1].notes).toBe('');
	});
});

describe('TaskStore update', () => {
	it('edits title and tags but never complexity', () => {
		const { store } = fresh();
		store.add('old', 'easy', ['a']);
		const id = store.tasks[0].id;
		store.update(id, { title: ' new ', tags: ['B', 'c'] });
		expect(store.tasks[0]).toMatchObject({ title: 'new', tags: ['b', 'c'], complexity: 'easy' });
	});

	it('keeps the old title when the new one is blank', () => {
		const { store } = fresh();
		store.add('keep', 'easy');
		store.update(store.tasks[0].id, { title: '   ' });
		expect(store.tasks[0].title).toBe('keep');
	});
});
