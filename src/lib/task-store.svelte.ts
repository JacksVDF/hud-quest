import { ConflictError, createLocalStorage, type TaskStorage } from './storage';
import {
	MAX_NOTES_LENGTH,
	addTag,
	canMarkDone,
	dropExpired,
	reconcileDone,
	totalXp,
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
		return { workspaces: this.#workspaces, tasks: this.#all };
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

		const before = { workspaces: this.#workspaces, all: this.#all };
		this.#workspaces = workspaces;
		this.#all = [...before.all, ...fresh];
		try {
			await this.#storage.save(this.#data());
		} catch (e) {
			this.#workspaces = before.workspaces;
			this.#all = before.all;
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
		workspaceId?: string
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
			for (const t of this.#all) {
				if (t.workspaceId === id && t.deletedAt === undefined) t.deletedAt = now;
			}
			this.#workspaces = this.#workspaces.filter((w) => w.id !== id);
		});
	}

	/** The name of a workspace, or '' when it does not exist. */
	workspaceName(id: string): string {
		return this.#workspaces.find((w) => w.id === id)?.name ?? '';
	}

	/**
	 * Where a trashed task came from: its workspace name, INBOX, or a note when that
	 * workspace was deleted.
	 */
	originOf(task: Task): string {
		if (task.workspaceId === undefined) return 'INBOX';
		return this.#workspaces.find((w) => w.id === task.workspaceId)?.name ?? 'deleted workspace';
	}

	/** Complexity is intentionally not editable for now. */
	update(id: string, patch: { title?: string; tags?: string[]; notes?: string }) {
		const task = this.#find(id);
		if (!task) return;
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
		const change = this.#change(() => (task.done = !task.done));
		return { ...change, done: task.done };
	}

	addItem(taskId: string, title: string): Change | null {
		const task = this.#find(taskId);
		const clean = title.trim();
		if (!task || task.complexity === 'easy' || !clean) return null;
		return this.#change(() => {
			task.items.push({ id: crypto.randomUUID(), title: clean, done: false });
			task.done = reconcileDone(task);
		});
	}

	toggleItem(taskId: string, itemId: string): Change | null {
		const task = this.#find(taskId);
		const item = task?.items.find((i) => i.id === itemId);
		if (!task || !item) return null;
		return this.#change(() => {
			item.done = !item.done;
			task.done = reconcileDone(task);
		});
	}

	removeItem(taskId: string, itemId: string): Change | null {
		const task = this.#find(taskId);
		if (!task) return null;
		return this.#change(() => {
			task.items = task.items.filter((i) => i.id !== itemId);
			task.done = reconcileDone(task);
		});
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
