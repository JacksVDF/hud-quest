import { mergeActivity, recordTask, recordXp, type Activity } from './activity';
import { dayKey, nextDue, type Repeat } from './dates';
import { ConflictError, createLocalStorage, type TaskStorage } from './storage';
import {
	MAX_NOTES_LENGTH,
	addTag,
	canMarkDone,
	dropExpired,
	normalizeSchedule,
	reconcileDone,
	taskXp,
	totalXp,
	type Schedule,
	type Task
} from './tasks';
import { levelFromXp } from './xp';
import type { Complexity } from './xp';
import {
	MAX_WORKSPACES,
	normalizeWorkspaceName,
	workspaceNameError,
	type Data,
	type Workspace
} from './workspaces';

/** What a mutation did to the player's XP, used for feedback messages. */
export interface Change {
	/** Positive when XP was gained, negative when it was removed. */
	delta: number;
	levelBefore: number;
	levelAfter: number;
}

/** How a workspace action went: the new id on success, or what the user must fix. */
export type WorkspaceResult = { id: string } | { error: string };

/** What an import brought in. */
export interface ImportResult {
	tasks: number;
	workspaces: number;
}

export class TaskStore {
	/** The user's workspaces, in creation order. Tasks without one live in the INBOX. */
	#workspaces = $state<Workspace[]>([]);
	workspaces = $derived(this.#workspaces);
	/** What was completed each day. Streaks and statistics read it, not the task list. */
	#activity = $state<Activity>({});
	activity = $derived(this.#activity);
	/** Everything that is saved: active tasks and trashed ones. */
	#all = $state<Task[]>([]);
	/** Active tasks. Trashed ones do not count for XP, filters or the list. */
	tasks = $derived(this.#all.filter((t) => t.deletedAt === undefined));
	/** Tasks waiting in the trash, most recently deleted first. */
	trash = $derived(
		this.#all.filter((t) => t.deletedAt !== undefined).sort((a, b) => b.deletedAt! - a.deletedAt!)
	);
	loaded = $state(false);
	/**
	 * Set when the account storage failed; cleared by the next successful load or save.
	 * `conflict` means another tab or device saved first: reload to see its version.
	 */
	problem = $state<'load' | 'save' | 'conflict' | ''>('');

	xp = $derived(totalXp(this.tasks));
	levelInfo = $derived(levelFromXp(this.xp));

	#storage: TaskStorage;
	/** Bumped on every load so a slow, outdated load cannot overwrite a newer one. */
	#generation = 0;

	constructor(storage: TaskStorage = createLocalStorage()) {
		this.#storage = storage;
	}

	/** Read from the storage. Call once on the client (e.g. in onMount). */
	load(): void | Promise<void> {
		const generation = ++this.#generation;
		this.loaded = false;
		this.problem = '';
		const apply = (data: Data) => {
			if (generation !== this.#generation) return;
			this.#workspaces = data.workspaces;
			this.#activity = data.activity;
			this.#all = dropExpired(data.tasks, Date.now());
			this.loaded = true;
		};
		const loading = this.#storage.load();
		if (!(loading instanceof Promise)) return apply(loading);
		return loading.then(apply, () => {
			if (generation === this.#generation) this.problem = 'load';
		});
	}

	/** Switches to another storage (guest <-> account) and loads from it. */
	useStorage(storage: TaskStorage) {
		this.#storage = storage;
		this.#workspaces = [];
		this.#activity = {};
		this.#all = [];
		return this.load();
	}

	/**
	 * Never saves before a successful load: with account storage that would replace the
	 * user's real list with an empty one.
	 */
	#save() {
		// After a conflict nothing is sent until the user reloads, or it would only fail again.
		if (!this.loaded || this.problem === 'conflict') return;
		const saving = this.#storage.save(this.#data());
		if (saving instanceof Promise) {
			saving.then(
				() => (this.problem = this.problem === 'save' ? '' : this.problem),
				(e) => (this.problem = e instanceof ConflictError ? 'conflict' : 'save')
			);
		}
	}

	#data(): Data {
		return { workspaces: this.#workspaces, tasks: this.#all, activity: this.#activity };
	}

	/**
	 * Adds the workspaces and tasks that are not here yet (matched by id) and waits until they
	 * are saved. A workspace whose name is already taken is merged into the existing one; when
	 * the limit is reached the rest of its tasks go to the INBOX. If saving fails everything is
	 * restored and the error is thrown.
	 */
	async importData(incoming: Data): Promise<ImportResult> {
		const none = { tasks: 0, workspaces: 0 };
		if (!this.loaded || this.problem === 'conflict') return none;

		const workspaces = [...this.#workspaces];
		/** Incoming workspace id -> id it has here (absent or undefined: INBOX). */
		const target: Record<string, string | undefined> = Object.create(null);
		let addedWorkspaces = 0;
		for (const w of incoming.workspaces) {
			if (workspaces.some((x) => x.id === w.id)) {
				target[w.id] = w.id;
				continue;
			}
			const sameName = workspaces.find((x) => x.name.toLowerCase() === w.name.toLowerCase());
			if (sameName) {
				target[w.id] = sameName.id;
			} else if (workspaces.length < MAX_WORKSPACES) {
				workspaces.push({ id: w.id, name: w.name });
				target[w.id] = w.id;
				addedWorkspaces++;
			} else {
				target[w.id] = undefined;
			}
		}

		const known = this.#all.map((t) => t.id);
		const fresh = incoming.tasks
			.filter((t) => !known.includes(t.id))
			.map((t) => {
				const copy = { ...t };
				if (copy.workspaceId === undefined) return copy;
				const mapped = target[copy.workspaceId];
				if (mapped === undefined) delete copy.workspaceId;
				else copy.workspaceId = mapped;
				return copy;
			});
		if (fresh.length === 0 && addedWorkspaces === 0) return none;

		const before = { workspaces: this.#workspaces, all: this.#all, activity: this.#activity };
		this.#workspaces = workspaces;
		this.#all = [...before.all, ...fresh];
		this.#activity = mergeActivity(before.activity, incoming.activity);
		try {
			await this.#storage.save(this.#data());
		} catch (e) {
			this.#workspaces = before.workspaces;
			this.#all = before.all;
			this.#activity = before.activity;
			throw e;
		}
		return { tasks: fresh.length, workspaces: addedWorkspaces };
	}

	/** Runs a mutation, saves, and reports the XP and level difference. */
	#change(mutate: () => void): Change {
		const xpBefore = this.xp;
		const levelBefore = this.levelInfo.level;
		mutate();
		this.#save();
		return { delta: this.xp - xpBefore, levelBefore, levelAfter: this.levelInfo.level };
	}

	/**
	 * Runs a change to one task and keeps the daily record in step with it. Completing a task
	 * counts it (and its XP) on today, and a recurring one creates its next occurrence. Undoing
	 * it takes both back from the day it was counted on. Deleting a task changes nothing here:
	 * what was achieved stays achieved.
	 */
	#settle(task: Task, mutate: () => void) {
		const wasDone = task.done;
		const xpBefore = taskXp(task);
		mutate();
		const now = Date.now();
		const delta = taskXp(task) - xpBefore;

		if (!wasDone && task.done) {
			const today = dayKey(now);
			task.completedAt = now;
			this.#activity = recordXp(
				recordTask(this.#activity, today, task.complexity, 1),
				today,
				delta
			);
			this.#spawnNext(task, today);
		} else if (wasDone && !task.done) {
			const day = dayKey(task.completedAt ?? now);
			delete task.completedAt;
			this.#activity = recordXp(recordTask(this.#activity, day, task.complexity, -1), day, delta);
			this.#withdrawNext(task);
		} else {
			// A hard task's milestones release XP one by one, before the task itself is done.
			this.#activity = recordXp(this.#activity, dayKey(now), delta);
		}
	}

	/** The next occurrence of a recurring task, once per task. */
	#spawnNext(task: Task, today: string) {
		if (!task.repeat || !task.dueDate || task.spawnedId) return;
		const id = crypto.randomUUID();
		const next: Task = {
			id,
			title: task.title,
			complexity: task.complexity,
			done: false,
			tags: [...task.tags],
			items: task.items.map((i) => ({ id: crypto.randomUUID(), title: i.title, done: false })),
			notes: task.notes,
			dueDate: nextDue(task.dueDate, task.repeat, today),
			repeat: task.repeat
		};
		if (task.workspaceId !== undefined) next.workspaceId = task.workspaceId;
		task.spawnedId = id;
		this.#all.push(next);
	}

	/**
	 * Un-completing a recurring task removes the occurrence it created, but only while that one
	 * is still untouched. Otherwise it stays, and the link is kept so completing the task again
	 * does not create a second copy.
	 */
	#withdrawNext(task: Task) {
		if (!task.spawnedId) return;
		const next = this.#all.find((t) => t.id === task.spawnedId && t.deletedAt === undefined);
		if (next && !next.done && next.items.every((i) => !i.done)) {
			this.#all = this.#all.filter((t) => t !== next);
			delete task.spawnedId;
		}
	}

	/** An active task; trashed tasks cannot be edited or toggled. */
	#find(id: string) {
		return this.#all.find((t) => t.id === id && t.deletedAt === undefined);
	}

	#findInTrash(id: string) {
		return this.#all.find((t) => t.id === id && t.deletedAt !== undefined);
	}

	/** An existing workspace id, or undefined (INBOX) when it does not exist. */
	#validWorkspace(id: string | undefined): string | undefined {
		return id !== undefined && this.#workspaces.some((w) => w.id === id) ? id : undefined;
	}

	/**
	 * Adds a task at the end of the list and returns its id (undefined if nothing was added).
	 * Without a workspace, or with one that does not exist, it goes to the INBOX.
	 */
	add(
		title: string,
		complexity: Complexity,
		tags: string[] = [],
		workspaceId?: string,
		schedule: Schedule = {}
	): string | undefined {
		const clean = title.trim();
		if (!clean || !this.loaded) return;
		const id = crypto.randomUUID();
		const task: Task = {
			id,
			title: clean,
			complexity,
			done: false,
			tags: tags.reduce<string[]>(addTag, []),
			items: [],
			notes: ''
		};
		const workspace = this.#validWorkspace(workspaceId);
		if (workspace !== undefined) task.workspaceId = workspace;
		Object.assign(task, normalizeSchedule(schedule.dueDate, schedule.repeat));
		this.#all.push(task);
		this.#save();
		return id;
	}

	/** Moves an active task to a workspace, or to the INBOX with `undefined`. */
	move(id: string, workspaceId: string | undefined): boolean {
		const task = this.#find(id);
		if (!task) return false;
		const target = this.#validWorkspace(workspaceId);
		if (workspaceId !== undefined && target === undefined) return false;
		if (target === undefined) delete task.workspaceId;
		else task.workspaceId = target;
		this.#save();
		return true;
	}

	/* ---------- workspaces ---------- */

	addWorkspace(name: string): WorkspaceResult {
		if (!this.loaded) return { error: 'Tasks are still loading.' };
		if (this.#workspaces.length >= MAX_WORKSPACES) {
			return { error: `At most ${MAX_WORKSPACES} workspaces.` };
		}
		const error = workspaceNameError(name, this.#workspaces);
		if (error) return { error };
		const id = crypto.randomUUID();
		this.#workspaces.push({ id, name: normalizeWorkspaceName(name) });
		this.#save();
		return { id };
	}

	renameWorkspace(id: string, name: string): WorkspaceResult {
		const workspace = this.#workspaces.find((w) => w.id === id);
		if (!workspace) return { error: 'That workspace no longer exists.' };
		const error = workspaceNameError(name, this.#workspaces, id);
		if (error) return { error };
		workspace.name = normalizeWorkspaceName(name);
		this.#save();
		return { id };
	}

	/**
	 * Deletes a workspace. Its tasks go to the trash (each remembers where it came from) and
	 * their XP is removed until they are restored.
	 */
	removeWorkspace(id: string): Change {
		return this.#change(() => {
			if (!this.#workspaces.some((w) => w.id === id)) return;
			const now = Date.now();
			const origin = this.workspaceName(id);
			for (const t of this.#all) {
				if (t.workspaceId !== id) continue;
				// Tasks already in the trash keep their own date; they only learn the name.
				if (t.deletedAt === undefined) t.deletedAt = now;
				t.originName = origin;
			}
			this.#workspaces = this.#workspaces.filter((w) => w.id !== id);
		});
	}

	/** The name of a workspace, or '' when it does not exist. */
	workspaceName(id: string): string {
		return this.#workspaces.find((w) => w.id === id)?.name ?? '';
	}

	/**
	 * Where a trashed task came from: its workspace name (as it was when the workspace was
	 * deleted, if it no longer exists) or INBOX.
	 */
	originOf(task: Task): string {
		if (task.workspaceId === undefined) return 'INBOX';
		return this.workspaceName(task.workspaceId) || task.originName || 'a deleted workspace';
	}

	/** Complexity is intentionally not editable for now. */
	update(
		id: string,
		patch: {
			title?: string;
			tags?: string[];
			notes?: string;
			/** `null` (or an invalid day) clears the deadline, and with it the repeat. */
			dueDate?: string | null;
			repeat?: Repeat | null;
		}
	) {
		const task = this.#find(id);
		if (!task) return;
		if ('dueDate' in patch || 'repeat' in patch) {
			const schedule = normalizeSchedule(
				'dueDate' in patch ? patch.dueDate : task.dueDate,
				'repeat' in patch ? patch.repeat : task.repeat
			);
			delete task.dueDate;
			delete task.repeat;
			Object.assign(task, schedule);
		}
		const title = patch.title?.trim();
		if (title) task.title = title;
		if (patch.tags) task.tags = patch.tags.reduce<string[]>(addTag, []);
		if (patch.notes !== undefined && task.complexity === 'hard') {
			task.notes = patch.notes.slice(0, MAX_NOTES_LENGTH);
		}
		this.#save();
	}

	/** Toggles a task's own checkbox. Does nothing if the task is gated by its items. */
	toggle(id: string): (Change & { done: boolean }) | null {
		const task = this.#find(id);
		if (!task || !canMarkDone(task)) return null;
		const change = this.#change(() => this.#settle(task, () => (task.done = !task.done)));
		return { ...change, done: task.done };
	}

	addItem(taskId: string, title: string): Change | null {
		const task = this.#find(taskId);
		const clean = title.trim();
		if (!task || task.complexity === 'easy' || !clean) return null;
		return this.#change(() =>
			this.#settle(task, () => {
				task.items.push({ id: crypto.randomUUID(), title: clean, done: false });
				task.done = reconcileDone(task);
			})
		);
	}

	toggleItem(taskId: string, itemId: string): Change | null {
		const task = this.#find(taskId);
		const item = task?.items.find((i) => i.id === itemId);
		if (!task || !item) return null;
		return this.#change(() =>
			this.#settle(task, () => {
				item.done = !item.done;
				task.done = reconcileDone(task);
			})
		);
	}

	removeItem(taskId: string, itemId: string): Change | null {
		const task = this.#find(taskId);
		if (!task) return null;
		return this.#change(() =>
			this.#settle(task, () => {
				task.items = task.items.filter((i) => i.id !== itemId);
				task.done = reconcileDone(task);
			})
		);
	}

	/** Moves a task to the trash. Its XP is removed until it is restored. */
	remove(id: string): Change {
		return this.#change(() => {
			const task = this.#find(id);
			if (task) task.deletedAt = Date.now();
		});
	}

	/** Takes a task out of the trash; its XP comes back. Without its workspace it goes to the INBOX. */
	restore(id: string): Change {
		return this.#change(() => {
			const task = this.#findInTrash(id);
			if (!task) return;
			delete task.deletedAt;
			delete task.originName;
			if (this.#validWorkspace(task.workspaceId) === undefined) delete task.workspaceId;
		});
	}

	/** Deletes a trashed task for good. */
	purge(id: string) {
		if (!this.#findInTrash(id)) return;
		this.#all = this.#all.filter((t) => t.id !== id);
		this.#save();
	}

	emptyTrash() {
		if (this.trash.length === 0) return;
		this.#all = this.#all.filter((t) => t.deletedAt === undefined);
		this.#save();
	}
}

export const taskStore = new TaskStore();
