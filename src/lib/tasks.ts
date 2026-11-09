import { COMPLEXITIES, XP_BY_COMPLEXITY, type Complexity } from './xp';

/** A subtask (medium tasks) or a milestone (hard tasks / projects). */
export interface Item {
	id: string;
	title: string;
	done: boolean;
}

export interface Task {
	id: string;
	title: string;
	complexity: Complexity;
	done: boolean;
	tags: string[];
	/** Subtasks for medium, milestones for hard. Always empty for easy. */
	items: Item[];
	/** Free-form project notes (hard tasks only). */
	notes: string;
	/** When the task was moved to the trash (ms since epoch). Absent for active tasks. */
	deletedAt?: number;
	/** The workspace it belongs to. Absent means INBOX; a trashed task keeps its origin. */
	workspaceId?: string;
}

export const STORAGE_KEY = 'hud-quest-todo:tasks';
export const MAX_TAGS = 3;
export const MAX_TAG_LENGTH = 20;
export const MAX_NOTES_LENGTH = 1000;
export const MAX_ID_LENGTH = 64;
/** Trashed tasks are removed for good after this many days. */
export const TRASH_DAYS = 30;

/* ---------- tags ---------- */

/** Trim, lowercase, collapse inner whitespace and cap the length. */
export function normalizeTag(raw: string): string {
	return raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH).trim();
}

/** Returns a new list with the tag added, or the same list if it is empty, duplicate or over the limit. */
export function addTag(tags: string[], raw: string): string[] {
	const tag = normalizeTag(raw);
	if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS) return tags;
	return [...tags, tag];
}

/** Sorted unique tags across all tasks. */
export function allTags(tasks: Task[]): string[] {
	return [...new Set(tasks.flatMap((t) => t.tags))].sort();
}

/* ---------- XP and completion ---------- */

export function allItemsDone(task: Task): boolean {
	return task.items.every((i) => i.done);
}

/**
 * XP currently earned by one task.
 * - easy / medium: full XP while done (medium subtasks give no XP of their own).
 * - hard with milestones: the 50 XP is released proportionally, floor(50 * done / total).
 * - hard without milestones: behaves like a plain task.
 */
export function taskXp(task: Task): number {
	const max = XP_BY_COMPLEXITY[task.complexity];
	if (task.complexity === 'hard' && task.items.length > 0) {
		const done = task.items.filter((i) => i.done).length;
		return Math.floor((max * done) / task.items.length);
	}
	return task.done ? max : 0;
}

/** Total XP earned: un-completing anything removes its XP again. */
export function totalXp(tasks: Task[]): number {
	return tasks.reduce((sum, t) => sum + taskXp(t), 0);
}

/**
 * Whether the user may tick the task's own checkbox. A task with subtasks or
 * milestones closes itself, so its checkbox is locked.
 */
export function canMarkDone(task: Task): boolean {
	return task.items.length === 0;
}

/**
 * The `done` value a task should have after its items changed. A medium task with
 * subtasks and a hard project with milestones are done exactly when every item is done
 * (auto-close). Without items the task keeps its manual value.
 */
export function reconcileDone(task: Task): boolean {
	if (task.items.length === 0) return task.done;
	return allItemsDone(task);
}

/* ---------- trash ---------- */

/** Drops tasks that have been in the trash longer than `TRASH_DAYS`. */
export function dropExpired(tasks: Task[], now: number): Task[] {
	const limit = TRASH_DAYS * 24 * 60 * 60 * 1000;
	return tasks.filter((t) => t.deletedAt === undefined || now - t.deletedAt < limit);
}

/** Whole days left before a trashed task is removed for good (at least 1 while it exists). */
export function daysLeftInTrash(task: Task, now: number): number {
	if (task.deletedAt === undefined) return TRASH_DAYS;
	const left = TRASH_DAYS * 24 * 60 * 60 * 1000 - (now - task.deletedAt);
	return Math.max(1, Math.ceil(left / (24 * 60 * 60 * 1000)));
}

/* ---------- filtering ---------- */

export type StatusFilter = 'all' | 'open' | 'done';

export interface TaskFilter {
	tags: string[];
	status: StatusFilter;
}

/** Keeps tasks matching the status and having ALL of the selected tags. */
export function filterTasks(tasks: Task[], filter: TaskFilter): Task[] {
	return tasks.filter((t) => {
		if (filter.status === 'open' && t.done) return false;
		if (filter.status === 'done' && !t.done) return false;
		return filter.tags.every((tag) => t.tags.includes(tag));
	});
}

/* ---------- loading ---------- */

function toItem(value: unknown): Item | null {
	if (typeof value !== 'object' || value === null) return null;
	const i = value as Record<string, unknown>;
	if (typeof i.id !== 'string' || typeof i.title !== 'string' || typeof i.done !== 'boolean') {
		return null;
	}
	return { id: i.id, title: i.title, done: i.done };
}

function toTask(value: unknown): Task | null {
	if (typeof value !== 'object' || value === null) return null;
	const t = value as Record<string, unknown>;
	if (
		typeof t.id !== 'string' ||
		typeof t.title !== 'string' ||
		typeof t.done !== 'boolean' ||
		!COMPLEXITIES.includes(t.complexity as Complexity)
	) {
		return null;
	}
	const complexity = t.complexity as Complexity;

	// Older saves have no tags/items/notes: fall back to empty values.
	let tags: string[] = [];
	if (Array.isArray(t.tags)) {
		for (const raw of t.tags) if (typeof raw === 'string') tags = addTag(tags, raw);
	}
	const items =
		complexity !== 'easy' && Array.isArray(t.items)
			? t.items.map(toItem).filter((i): i is Item => i !== null)
			: [];
	const notes =
		complexity === 'hard' && typeof t.notes === 'string' ? t.notes.slice(0, MAX_NOTES_LENGTH) : '';

	const task: Task = { id: t.id, title: t.title, complexity, done: t.done, tags, items, notes };
	if (typeof t.deletedAt === 'number' && Number.isFinite(t.deletedAt)) task.deletedAt = t.deletedAt;
	if (typeof t.workspaceId === 'string' && t.workspaceId && t.workspaceId.length <= MAX_ID_LENGTH) {
		task.workspaceId = t.workspaceId;
	}
	task.done = reconcileDone(task);
	return task;
}

/** Validates untrusted data; returns null unless it is an array, and drops invalid entries. */
export function toTasks(data: unknown): Task[] | null {
	return Array.isArray(data) ? data.map(toTask).filter((t): t is Task => t !== null) : null;
}

/** Parse saved JSON; returns [] for anything missing or malformed. */
export function parseTasks(json: string | null): Task[] {
	if (!json) return [];
	try {
		return toTasks(JSON.parse(json)) ?? [];
	} catch {
		return [];
	}
}
