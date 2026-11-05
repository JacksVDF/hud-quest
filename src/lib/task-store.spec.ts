import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, createRemoteStorage } from './storage';
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

const seed = (id: string): Task => ({
	id,
	title: id,
	complexity: 'easy',
	done: false,
	tags: [],
	items: [],
	notes: ''
});

describe('TaskStore with async storage', () => {
	it('is not loaded until the storage answers, and ignores adds before that', async () => {
		let answer!: (tasks: Task[]) => void;
		const saves: Task[][] = [];
		const store = new TaskStore({
			load: () => new Promise<Task[]>((resolve) => (answer = resolve)),
			save: (t) => void saves.push(t)
		});
		const loading = store.load();
		expect(store.loaded).toBe(false);
		store.add('too early', 'easy');
		expect(store.tasks).toEqual([]);
		expect(saves).toEqual([]);
		answer([seed('a')]);
		await loading;
		expect(store.loaded).toBe(true);
		expect(store.tasks.map((t) => t.id)).toEqual(['a']);
	});

	it('reports a load problem and never saves over the account list', async () => {
		const saves: Task[][] = [];
		const store = new TaskStore({
			load: () => Promise.reject(new Error('offline')),
			save: (t) => void saves.push(t)
		});
		await store.load();
		expect(store.problem).toBe('load');
		expect(store.loaded).toBe(false);
		store.add('lost', 'easy');
		expect(saves).toEqual([]);
	});

	it('reports a save problem and clears it after a successful save', async () => {
		let fail = true;
		const store = new TaskStore({
			load: () => [],
			save: () => (fail ? Promise.reject(new Error('offline')) : Promise.resolve())
		});
		store.load();
		store.add('a', 'easy');
		await new Promise((r) => setTimeout(r));
		expect(store.problem).toBe('save');
		fail = false;
		store.add('b', 'easy');
		await new Promise((r) => setTimeout(r));
		expect(store.problem).toBe('');
	});

	it('a slow older load cannot overwrite a newer one', async () => {
		const resolvers: Array<(t: Task[]) => void> = [];
		const store = new TaskStore({
			load: () => new Promise<Task[]>((resolve) => resolvers.push(resolve)),
			save: () => {}
		});
		const first = store.load();
		const second = store.useStorage({
			load: () => [seed('new')],
			save: () => {}
		});
		resolvers[0]([seed('old')]);
		await first;
		await second;
		expect(store.tasks.map((t) => t.id)).toEqual(['new']);
	});
});

describe('createRemoteStorage', () => {
	const reply = (body: unknown, version: number, status = 200) =>
		new Response(JSON.stringify(body), { status, headers: { etag: `"${version}"` } });
	const asFetch = (f: unknown) => f as typeof fetch;

	it('loads and validates the tasks from the API', async () => {
		const fetcher = vi.fn(async () => reply([seed('a'), { id: 5 }], 3));
		const tasks = await createRemoteStorage(asFetch(fetcher)).load();
		expect(tasks.map((t) => t.id)).toEqual(['a']);
	});

	it('rejects when the API fails', async () => {
		const storage = createRemoteStorage(asFetch(async () => new Response('no', { status: 401 })));
		await expect(storage.load()).rejects.toThrow();
		await expect(storage.save([])).rejects.toThrow();
	});

	it('refuses to save before the tasks were loaded', async () => {
		const fetcher = vi.fn(async () => reply([], 1));
		await expect(createRemoteStorage(asFetch(fetcher)).save([seed('a')])).rejects.toThrow();
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('sends the last known version and moves on to the one the server answers', async () => {
		const sent: Array<string | null> = [];
		const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
			if (!init) return reply([], 5);
			sent.push(new Headers(init.headers).get('if-match'));
			return reply([], 5 + sent.length);
		});
		const storage = createRemoteStorage(asFetch(fetcher));
		await storage.load();
		await storage.save([seed('a')]);
		await storage.save([seed('b')]);
		expect(sent).toEqual(['"5"', '"6"']);
	});

	it('throws ConflictError on 412', async () => {
		const fetcher = vi.fn(async (_url: string, init?: RequestInit) =>
			init ? new Response('changed', { status: 412 }) : reply([], 1)
		);
		const storage = createRemoteStorage(asFetch(fetcher));
		await storage.load();
		await expect(storage.save([seed('a')])).rejects.toBeInstanceOf(ConflictError);
	});

	it('sends saves one at a time, in order', async () => {
		const order: string[] = [];
		let releaseFirst!: () => void;
		const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
			if (!init) return reply([], 1);
			const label = (JSON.parse(init.body as string) as Task[])[0].id;
			order.push(`start ${label}`);
			if (label === 'one') await new Promise<void>((r) => (releaseFirst = r));
			order.push(`end ${label}`);
			return reply([], order.length);
		});
		const storage = createRemoteStorage(asFetch(fetcher));
		await storage.load();
		const a = storage.save([seed('one')]);
		const b = storage.save([seed('two')]);
		await new Promise((r) => setTimeout(r));
		releaseFirst();
		await Promise.all([a, b]);
		expect(order).toEqual(['start one', 'end one', 'start two', 'end two']);
	});
});

describe('TaskStore conflicts', () => {
	it('stops saving after a conflict until the tasks are reloaded', async () => {
		let conflict = true;
		const saves: Task[][] = [];
		const store = new TaskStore({
			load: () => [seed('a')],
			save: (t) => {
				saves.push(t);
				return conflict ? Promise.reject(new ConflictError()) : Promise.resolve();
			}
		});
		store.load();
		store.add('b', 'easy');
		await new Promise((r) => setTimeout(r));
		expect(store.problem).toBe('conflict');

		store.add('c', 'easy');
		expect(saves).toHaveLength(1);

		conflict = false;
		store.load();
		expect(store.problem).toBe('');
		store.add('d', 'easy');
		expect(saves).toHaveLength(2);
	});
});

describe('TaskStore importTasks', () => {
	it('adds only tasks it does not have yet and saves once', async () => {
		const saves: Task[][] = [];
		const store = new TaskStore({
			load: () => [seed('a')],
			save: (t) => void saves.push(structuredClone(t))
		});
		store.load();
		const added = await store.importTasks([seed('a'), seed('b'), seed('c')]);
		expect(added).toBe(2);
		expect(store.tasks.map((t) => t.id)).toEqual(['a', 'b', 'c']);
		expect(saves).toHaveLength(1);
	});

	it('does nothing before the list is loaded', async () => {
		const store = new TaskStore({ load: () => [], save: () => {} });
		expect(await store.importTasks([seed('a')])).toBe(0);
		expect(store.tasks).toEqual([]);
	});

	it('restores the list and throws when saving fails', async () => {
		const store = new TaskStore({
			load: () => [seed('a')],
			save: () => Promise.reject(new Error('offline'))
		});
		store.load();
		await expect(store.importTasks([seed('b')])).rejects.toThrow();
		expect(store.tasks.map((t) => t.id)).toEqual(['a']);
	});
});
