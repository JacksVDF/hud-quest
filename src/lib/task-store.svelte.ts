import { createLocalStorage, type TaskStorage } from './storage';
import { MAX_NOTES_LENGTH, addTag, canMarkDone, reconcileDone, totalXp, type Task } from './tasks';
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
	tasks = $state<Task[]>([]);
	loaded = $state(false);
	/** Set when the account storage failed; cleared by the next successful load or save. */
	problem = $state<'load' | 'save' | ''>('');

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
			this.tasks = tasks;
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
		this.tasks = [];
		return this.load();
	}

	/**
	 * Never saves before a successful load: with account storage that would replace the
	 * user's real list with an empty one.
	 */
	#save() {
		if (!this.loaded) return;
		const saving = this.#storage.save(this.tasks);
		if (saving instanceof Promise) {
			saving.then(
				() => (this.problem = this.problem === 'save' ? '' : this.problem),
				() => (this.problem = 'save')
			);
		}
	}

	/** Runs a mutation, saves, and reports the XP and level difference. */
	#change(mutate: () => void): Change {
		const xpBefore = this.xp;
		const levelBefore = this.levelInfo.level;
		mutate();
		this.#save();
		return { delta: this.xp - xpBefore, levelBefore, levelAfter: this.levelInfo.level };
	}

	#find(id: string) {
		return this.tasks.find((t) => t.id === id);
	}

	add(title: string, complexity: Complexity, tags: string[] = []) {
		const clean = title.trim();
		if (!clean || !this.loaded) return;
		this.tasks.push({
			id: crypto.randomUUID(),
			title: clean,
			complexity,
			done: false,
			tags: tags.reduce<string[]>(addTag, []),
			items: [],
			notes: ''
		});
		this.#save();
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

	remove(id: string): Change {
		return this.#change(() => {
			this.tasks = this.tasks.filter((t) => t.id !== id);
		});
	}
}

export const taskStore = new TaskStore();
