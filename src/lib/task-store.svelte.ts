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

/** What a mutation did to the player's XP, used for feedback messages. */
export interface Change {
	/** Positive when XP was gained, negative when it was removed. */
	delta: number;
	levelBefore: number;
	levelAfter: number;
}

export class TaskStore {
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
		const apply = (tasks: Task[]) => {
			if (generation !== this.#generation) return;
			this.#all = dropExpired(tasks, Date.now());
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
		const saving = this.#storage.save(this.#all);
		if (saving instanceof Promise) {
			saving.then(
				() => (this.problem = this.problem === 'save' ? '' : this.problem),
				(e) => (this.problem = e instanceof ConflictError ? 'conflict' : 'save')
			);
		}
	}

	/**
	 * Adds tasks that are not in the list yet (matched by id) and waits until they are saved.
	 * Returns how many were added. If saving fails the list is restored and the error is thrown.
	 */
	async importTasks(incoming: Task[]): Promise<number> {
		if (!this.loaded || this.problem === 'conflict') return 0;
		const known = this.#all.map((t) => t.id);
		const fresh = incoming.filter((t) => !known.includes(t.id));
		if (fresh.length === 0) return 0;
		const before = this.#all;
		this.#all = [...before, ...fresh];
		try {
			await this.#storage.save(this.#all);
		} catch (e) {
			this.#all = before;
			throw e;
		}
		return fresh.length;
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

	/** Adds a task at the end of the list and returns its id (undefined if nothing was added). */
	add(title: string, complexity: Complexity, tags: string[] = []): string | undefined {
		const clean = title.trim();
		if (!clean || !this.loaded) return;
		const id = crypto.randomUUID();
		this.#all.push({
			id,
			title: clean,
			complexity,
			done: false,
			tags: tags.reduce<string[]>(addTag, []),
			items: [],
			notes: ''
		});
		this.#save();
		return id;
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

	/** Takes a task out of the trash; its XP comes back. */
	restore(id: string): Change {
		return this.#change(() => {
			const task = this.#findInTrash(id);
			if (task) delete task.deletedAt;
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
