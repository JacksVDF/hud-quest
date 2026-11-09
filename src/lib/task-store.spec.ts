import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, createRemoteStorage, versionOf } from './storage';
import { STORAGE_KEY, type Task } from './tasks';
import type { Data } from './workspaces';
import { TaskStore } from './task-store.svelte';

function stubStorage(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => void data.set(k, v)
	});
	return data;
}

const doc = (tasks: Task[] = [], workspaces: Data['workspaces'] = []): Data => ({
	workspaces,
	tasks
});
/** What the store saved last, read back from the fake localStorage. */
const savedTasks = (data: Map<string, string>): Task[] =>
	(JSON.parse(data.get(STORAGE_KEY) ?? '{"tasks":[]}') as Data).tasks;

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
		expect(savedTasks(data)).toHaveLength(1);
	});

	it('returns the id of the new task, and nothing for a blank title', () => {
		const { store } = fresh();
		expect(store.add('   ', 'easy')).toBeUndefined();
		const id = store.add('Find me', 'easy');
		expect(store.tasks.map((t) => t.id)).toEqual([id]);
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
		const saved: Data[] = [];
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
			load: () => doc([seed]),
			save: (d) => void saved.push(structuredClone(d))
		});
		store.load();
		expect(store.tasks.map((t) => t.title)).toEqual(['seeded']);
		store.toggle('s1');
		expect(saved).toHaveLength(1);
		expect(saved[0].tasks[0].done).toBe(true);
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
		let answer!: (data: Data) => void;
		const saves: Data[] = [];
		const store = new TaskStore({
			load: () => new Promise<Data>((resolve) => (answer = resolve)),
			save: (t) => void saves.push(t)
		});
		const loading = store.load();
		expect(store.loaded).toBe(false);
		store.add('too early', 'easy');
		expect(store.tasks).toEqual([]);
		expect(saves).toEqual([]);
		answer(doc([seed('a')]));
		await loading;
		expect(store.loaded).toBe(true);
		expect(store.tasks.map((t) => t.id)).toEqual(['a']);
	});

	it('reports a load problem and never saves over the account list', async () => {
		const saves: Data[] = [];
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
			load: () => doc(),
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
		const resolvers: Array<(d: Data) => void> = [];
		const store = new TaskStore({
			load: () => new Promise<Data>((resolve) => resolvers.push(resolve)),
			save: () => {}
		});
		const first = store.load();
		const second = store.useStorage({
			load: () => doc([seed('new')]),
			save: () => {}
		});
		resolvers[0](doc([seed('old')]));
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
		const fetcher = vi.fn(async () =>
			reply({ workspaces: [{ id: 'w', name: 'Work' }], tasks: [seed('a'), { id: 5 }] }, 3)
		);
		const data = await createRemoteStorage(asFetch(fetcher)).load();
		expect(data.tasks.map((t) => t.id)).toEqual(['a']);
		expect(data.workspaces).toEqual([{ id: 'w', name: 'Work' }]);
	});

	it('still reads the old plain task list from the API', async () => {
		const fetcher = vi.fn(async () => reply([seed('a')], 3));
		const data = await createRemoteStorage(asFetch(fetcher)).load();
		expect(data).toMatchObject({ workspaces: [], tasks: [{ id: 'a' }] });
	});

	it('rejects when the API fails', async () => {
		const storage = createRemoteStorage(asFetch(async () => new Response('no', { status: 401 })));
		await expect(storage.load()).rejects.toThrow();
		await expect(storage.save(doc())).rejects.toThrow();
	});

	it('refuses to save before the tasks were loaded', async () => {
		const fetcher = vi.fn(async () => reply([], 1));
		await expect(createRemoteStorage(asFetch(fetcher)).save(doc([seed('a')]))).rejects.toThrow();
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('sends the last known version and moves on to the one the server answers', async () => {
		const sent: Array<string | null> = [];
		const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
			if (!init) return reply(doc(), 5);
			sent.push(new Headers(init.headers).get('if-match'));
			return reply(doc(), 5 + sent.length);
		});
		const storage = createRemoteStorage(asFetch(fetcher));
		await storage.load();
		await storage.save(doc([seed('a')]));
		await storage.save(doc([seed('b')]));
		expect(sent).toEqual(['"5"', '"6"']);
	});

	it('works when the server answers with weak ETags', async () => {
		const sent: Array<string | null> = [];
		const weak = (body: unknown, v: number) =>
			new Response(JSON.stringify(body), { headers: { etag: `W/"${v}"` } });
		const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
			if (!init) return weak(doc([seed('a')]), 4);
			sent.push(new Headers(init.headers).get('if-match'));
			return weak(doc(), 5);
		});
		const storage = createRemoteStorage(asFetch(fetcher));
		expect((await storage.load()).tasks.map((t) => t.id)).toEqual(['a']);
		await storage.save(doc([seed('b')]));
		expect(sent).toEqual(['"4"']);
	});

	it('throws ConflictError on 412', async () => {
		const fetcher = vi.fn(async (_url: string, init?: RequestInit) =>
			init ? new Response('changed', { status: 412 }) : reply(doc(), 1)
		);
		const storage = createRemoteStorage(asFetch(fetcher));
		await storage.load();
		await expect(storage.save(doc([seed('a')]))).rejects.toBeInstanceOf(ConflictError);
	});

	it('sends saves one at a time, in order', async () => {
		const order: string[] = [];
		let releaseFirst!: () => void;
		const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
			if (!init) return reply(doc(), 1);
			const label = (JSON.parse(init.body as string) as Data).tasks[0].id;
			order.push(`start ${label}`);
			if (label === 'one') await new Promise<void>((r) => (releaseFirst = r));
			order.push(`end ${label}`);
			return reply(doc(), order.length);
		});
		const storage = createRemoteStorage(asFetch(fetcher));
		await storage.load();
		const a = storage.save(doc([seed('one')]));
		const b = storage.save(doc([seed('two')]));
		await new Promise((r) => setTimeout(r));
		releaseFirst();
		await Promise.all([a, b]);
		expect(order).toEqual(['start one', 'end one', 'start two', 'end two']);
	});
});

describe('versionOf (ETag)', () => {
	const withEtag = (etag?: string) =>
		new Response('[]', { headers: etag === undefined ? {} : { etag } });

	it('reads strong and weak ETags (Cloudflare weakens them when compressing)', () => {
		expect(versionOf(withEtag('"3"'))).toBe(3);
		expect(versionOf(withEtag('W/"3"'))).toBe(3);
		expect(versionOf(withEtag('"0"'))).toBe(0);
	});

	it('rejects a missing or malformed ETag', () => {
		expect(() => versionOf(withEtag())).toThrow();
		expect(() => versionOf(withEtag('"abc"'))).toThrow();
		expect(() => versionOf(withEtag('""'))).toThrow();
	});
});

describe('TaskStore conflicts', () => {
	it('stops saving after a conflict until the tasks are reloaded', async () => {
		let conflict = true;
		const saves: Data[] = [];
		const store = new TaskStore({
			load: () => doc([seed('a')]),
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

describe('TaskStore importData', () => {
	const storeWith = (data: Data) => {
		const saves: Data[] = [];
		const store = new TaskStore({
			load: () => structuredClone(data),
			save: (d) => void saves.push(structuredClone(d))
		});
		store.load();
		return { store, saves };
	};

	it('adds only tasks it does not have yet and saves once', async () => {
		const { store, saves } = storeWith(doc([seed('a')]));
		const result = await store.importData(doc([seed('a'), seed('b'), seed('c')]));
		expect(result).toEqual({ tasks: 2, workspaces: 0 });
		expect(store.tasks.map((t) => t.id)).toEqual(['a', 'b', 'c']);
		expect(saves).toHaveLength(1);
	});

	it('does nothing before the list is loaded', async () => {
		const store = new TaskStore({ load: () => doc(), save: () => {} });
		expect(await store.importData(doc([seed('a')]))).toEqual({ tasks: 0, workspaces: 0 });
		expect(store.tasks).toEqual([]);
	});

	it('restores everything and throws when saving fails', async () => {
		const store = new TaskStore({
			load: () => doc([seed('a')]),
			save: () => Promise.reject(new Error('offline'))
		});
		store.load();
		await expect(store.importData(doc([seed('b')], [{ id: 'w', name: 'Work' }]))).rejects.toThrow();
		expect(store.tasks.map((t) => t.id)).toEqual(['a']);
		expect(store.workspaces).toEqual([]);
	});

	it('brings workspaces along with their tasks', async () => {
		const { store } = storeWith(doc());
		const incoming = doc(
			[{ ...seed('a'), workspaceId: 'w1' }, seed('b')],
			[{ id: 'w1', name: 'Work' }]
		);
		expect(await store.importData(incoming)).toEqual({ tasks: 2, workspaces: 1 });
		expect(store.workspaces).toEqual([{ id: 'w1', name: 'Work' }]);
		expect(store.tasks.find((t) => t.id === 'a')?.workspaceId).toBe('w1');
		expect(store.tasks.find((t) => t.id === 'b')?.workspaceId).toBeUndefined();
	});

	it('merges a workspace whose name already exists into the existing one', async () => {
		const { store } = storeWith(doc([], [{ id: 'mine', name: 'Work' }]));
		const incoming = doc(
			[{ ...seed('a'), workspaceId: 'theirs' }],
			[{ id: 'theirs', name: 'work' }]
		);
		expect(await store.importData(incoming)).toEqual({ tasks: 1, workspaces: 0 });
		expect(store.workspaces).toHaveLength(1);
		expect(store.tasks[0].workspaceId).toBe('mine');
	});

	it('treats a workspace id like __proto__ as any other id', async () => {
		const { store } = storeWith(doc());
		const incoming = doc(
			[{ ...seed('a'), workspaceId: '__proto__' }],
			[{ id: '__proto__', name: 'Odd' }]
		);
		await store.importData(incoming);
		expect(store.workspaces).toEqual([{ id: '__proto__', name: 'Odd' }]);
		expect(store.tasks[0].workspaceId).toBe('__proto__');
	});

	it('sends tasks to the INBOX when the workspace limit is reached', async () => {
		const full = Array.from({ length: 10 }, (_, i) => ({ id: `w${i}`, name: `W${i}` }));
		const { store } = storeWith(doc([], full));
		const incoming = doc(
			[{ ...seed('a'), workspaceId: 'extra' }],
			[{ id: 'extra', name: 'Extra' }]
		);
		expect(await store.importData(incoming)).toEqual({ tasks: 1, workspaces: 0 });
		expect(store.workspaces).toHaveLength(10);
		expect(store.tasks[0].workspaceId).toBeUndefined();
	});
});

describe('TaskStore trash', () => {
	it('moves a task to the trash instead of deleting it, and saves it there', () => {
		const { store, data } = fresh();
		store.add('keep me', 'easy');
		const id = store.tasks[0].id;
		store.remove(id);
		expect(store.tasks).toHaveLength(0);
		expect(store.trash.map((t) => t.id)).toEqual([id]);
		const saved = savedTasks(data);
		expect(saved).toHaveLength(1);
		expect(typeof saved[0].deletedAt).toBe('number');
	});

	it('a trashed done task gives no XP, and restoring brings it back', () => {
		const { store } = fresh();
		store.add('a', 'medium');
		const id = store.tasks[0].id;
		store.toggle(id);
		expect(store.remove(id).delta).toBe(-25);
		expect(store.xp).toBe(0);
		expect(store.restore(id).delta).toBe(25);
		expect(store.xp).toBe(25);
		expect(store.tasks.map((t) => t.id)).toEqual([id]);
		expect(store.trash).toEqual([]);
	});

	it('trashed tasks cannot be edited, toggled or given items', () => {
		const { store } = fresh();
		store.add('a', 'medium');
		const id = store.tasks[0].id;
		store.remove(id);
		expect(store.toggle(id)).toBeNull();
		expect(store.addItem(id, 'x')).toBeNull();
		store.update(id, { title: 'changed' });
		expect(store.trash[0].title).toBe('a');
	});

	it('shows the most recently deleted task first', () => {
		const { store } = fresh();
		store.add('first', 'easy');
		store.add('second', 'easy');
		vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);
		store.remove(store.tasks[0].id);
		store.remove(store.tasks[0].id);
		expect(store.trash.map((t) => t.title)).toEqual(['second', 'first']);
		vi.restoreAllMocks();
	});

	it('purge deletes one trashed task for good; active tasks are never purged', () => {
		const { store, data } = fresh();
		store.add('a', 'easy');
		store.add('b', 'easy');
		const [a, b] = store.tasks.map((t) => t.id);
		store.remove(a);
		store.purge(b);
		expect(store.tasks.map((t) => t.id)).toEqual([b]);
		store.purge(a);
		expect(store.trash).toEqual([]);
		expect(savedTasks(data)).toHaveLength(1);
	});

	it('emptyTrash removes every trashed task and keeps the active ones', () => {
		const { store } = fresh();
		for (const t of ['a', 'b', 'c']) store.add(t, 'easy');
		store.remove(store.tasks[0].id);
		store.remove(store.tasks[0].id);
		store.emptyTrash();
		expect(store.trash).toEqual([]);
		expect(store.tasks.map((t) => t.title)).toEqual(['c']);
	});

	it('drops tasks that have been in the trash for more than 30 days when loading', () => {
		const old = { ...seed('old'), deletedAt: Date.now() - 31 * 24 * 60 * 60 * 1000 };
		const recent = { ...seed('recent'), deletedAt: Date.now() - 24 * 60 * 60 * 1000 };
		const store = new TaskStore({ load: () => doc([old, recent, seed('active')]), save: () => {} });
		store.load();
		expect(store.trash.map((t) => t.id)).toEqual(['recent']);
		expect(store.tasks.map((t) => t.id)).toEqual(['active']);
	});
});

describe('TaskStore workspaces', () => {
	it('creates workspaces with a trimmed name and saves them', () => {
		const { store, data } = fresh();
		const result = store.addWorkspace('  My   Work ');
		expect(result).toEqual({ id: 'id-1' });
		expect(store.workspaces).toEqual([{ id: 'id-1', name: 'My Work' }]);
		expect(JSON.parse(data.get(STORAGE_KEY)!).workspaces).toHaveLength(1);
	});

	it('refuses blank, duplicate and reserved names with a reason', () => {
		const { store } = fresh();
		store.addWorkspace('Work');
		expect(store.addWorkspace('  ')).toHaveProperty('error');
		expect(store.addWorkspace('WORK')).toMatchObject({ error: expect.stringMatching(/already/) });
		expect(store.addWorkspace('inbox')).toMatchObject({ error: expect.stringMatching(/reserved/) });
		expect(store.workspaces).toHaveLength(1);
	});

	it('allows at most ten workspaces', () => {
		const { store } = fresh();
		for (let i = 0; i < 10; i++) expect(store.addWorkspace(`W${i}`)).toHaveProperty('id');
		expect(store.addWorkspace('One too many')).toMatchObject({
			error: expect.stringMatching(/10/)
		});
		expect(store.workspaces).toHaveLength(10);
	});

	it('does not create workspaces before the data is loaded', () => {
		const store = new TaskStore({ load: () => new Promise<Data>(() => {}), save: () => {} });
		store.load();
		expect(store.addWorkspace('Early')).toHaveProperty('error');
	});

	it('renames a workspace, allowing its own name with a different case', () => {
		const { store } = fresh();
		const { id } = store.addWorkspace('Work') as { id: string };
		store.addWorkspace('Home');
		expect(store.renameWorkspace(id, 'work')).toEqual({ id });
		expect(store.workspaces[0].name).toBe('work');
		expect(store.renameWorkspace(id, 'HOME')).toHaveProperty('error');
		expect(store.renameWorkspace('nope', 'X')).toHaveProperty('error');
	});

	it('adds a task to a workspace, or to the INBOX when the workspace does not exist', () => {
		const { store } = fresh();
		const { id: w } = store.addWorkspace('Work') as { id: string };
		store.add('in work', 'easy', [], w);
		store.add('lost', 'easy', [], 'ghost');
		store.add('plain', 'easy');
		expect(store.tasks.map((t) => t.workspaceId)).toEqual([w, undefined, undefined]);
	});

	it('moves a task between workspaces and back to the INBOX', () => {
		const { store } = fresh();
		const { id: w } = store.addWorkspace('Work') as { id: string };
		const taskId = store.add('a', 'easy') as string;
		expect(store.move(taskId, w)).toBe(true);
		expect(store.tasks[0].workspaceId).toBe(w);
		expect(store.move(taskId, undefined)).toBe(true);
		expect(store.tasks[0].workspaceId).toBeUndefined();
		expect(store.move(taskId, 'ghost')).toBe(false);
		expect(store.move('nope', w)).toBe(false);
	});

	it('does not move a trashed task', () => {
		const { store } = fresh();
		const { id: w } = store.addWorkspace('Work') as { id: string };
		const taskId = store.add('a', 'easy') as string;
		store.remove(taskId);
		expect(store.move(taskId, w)).toBe(false);
	});

	it('keeps XP global across workspaces', () => {
		const { store } = fresh();
		const { id: w } = store.addWorkspace('Work') as { id: string };
		store.toggle(store.add('a', 'easy', [], w) as string);
		store.toggle(store.add('b', 'medium') as string);
		expect(store.xp).toBe(35);
	});

	it('deleting a workspace sends its tasks to the trash and removes their XP', () => {
		const { store } = fresh();
		const { id: w } = store.addWorkspace('Work') as { id: string };
		store.toggle(store.add('a', 'easy', [], w) as string);
		store.add('b', 'easy', [], w);
		store.add('stays', 'easy');
		expect(store.xp).toBe(10);

		const change = store.removeWorkspace(w);
		expect(change.delta).toBe(-10);
		expect(store.workspaces).toEqual([]);
		expect(store.tasks.map((t) => t.title)).toEqual(['stays']);
		expect(store.trash.map((t) => t.title).sort()).toEqual(['a', 'b']);
		expect(store.xp).toBe(0);
	});

	it('deleting a workspace never touches already trashed tasks of other origins', () => {
		const { store } = fresh();
		const { id: w } = store.addWorkspace('Work') as { id: string };
		const inbox = store.add('old', 'easy') as string;
		store.remove(inbox);
		store.add('in work', 'easy', [], w);
		store.removeWorkspace(w);
		expect(store.trash.find((t) => t.title === 'old')?.workspaceId).toBeUndefined();
		expect(store.trash).toHaveLength(2);
	});

	it('says where a trashed task came from', () => {
		const { store } = fresh();
		const { id: w } = store.addWorkspace('Work') as { id: string };
		const a = store.add('a', 'easy', [], w) as string;
		const b = store.add('b', 'easy') as string;
		store.remove(a);
		store.remove(b);
		const origin = (id: string) => store.originOf(store.trash.find((t) => t.id === id)!);
		expect(origin(a)).toBe('Work');
		expect(origin(b)).toBe('INBOX');
		store.renameWorkspace(w, 'Job');
		expect(origin(a)).toBe('Job');
		store.removeWorkspace(w);
		expect(origin(a)).toBe('Job');
		expect(store.trash.find((t) => t.id === a)?.originName).toBe('Job');
	});

	it('a task trashed before its workspace was deleted keeps its date and learns the name', () => {
		const { store } = fresh();
		const { id: w } = store.addWorkspace('Work') as { id: string };
		const a = store.add('a', 'easy', [], w) as string;
		vi.spyOn(Date, 'now').mockReturnValueOnce(1000);
		store.remove(a);
		vi.spyOn(Date, 'now').mockReturnValueOnce(9000);
		store.removeWorkspace(w);
		vi.restoreAllMocks();
		expect(store.trash[0]).toMatchObject({ deletedAt: 1000, originName: 'Work' });
		expect(store.originOf(store.trash[0])).toBe('Work');
	});

	it('restores a task to its workspace, or to the INBOX when that workspace is gone', () => {
		const { store } = fresh();
		const { id: w } = store.addWorkspace('Work') as { id: string };
		const a = store.add('a', 'easy', [], w) as string;
		store.remove(a);
		store.restore(a);
		expect(store.tasks[0].workspaceId).toBe(w);

		store.removeWorkspace(w);
		expect(store.trash[0].workspaceId).toBe(w);
		store.restore(a);
		expect(store.tasks[0].workspaceId).toBeUndefined();
		expect(store.xp).toBe(0);
	});

	it('reloads workspaces from storage', () => {
		const { store, data } = fresh();
		store.addWorkspace('Work');
		const other = new TaskStore();
		other.load();
		expect(other.workspaces.map((w) => w.name)).toEqual(['Work']);
		expect(data.size).toBe(1);
	});
});
