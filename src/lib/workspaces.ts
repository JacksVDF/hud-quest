import { PAGE_SIZE } from './pagination';
import { MAX_ID_LENGTH, toTasks, type Task } from './tasks';

/** A named group of tasks. Tasks without a workspace live in the INBOX. */
export interface Workspace {
	id: string;
	name: string;
}

/** Everything a user saves: their workspaces and all their tasks (active and trashed). */
export interface Data {
	workspaces: Workspace[];
	tasks: Task[];
}

/** One global "ten": items per page and the most workspaces a user can have. */
export const MAX_WORKSPACES = PAGE_SIZE;
export const MAX_WORKSPACE_NAME = 30;
/** Route id of the INBOX card. Real workspace ids are UUIDs, so it can never clash. */
export const INBOX_ID = 'inbox';

/* ---------- names ---------- */

/** Trim, collapse inner whitespace and cap the length. Case is kept for display. */
export function normalizeWorkspaceName(raw: string): string {
	return raw.trim().replace(/\s+/g, ' ').slice(0, MAX_WORKSPACE_NAME).trim();
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Why `raw` cannot be a workspace name, or '' when it is fine. `exceptId` is the workspace
 * being renamed, so keeping its own name is allowed.
 */
export function workspaceNameError(
	raw: string,
	workspaces: Workspace[],
	exceptId?: string
): string {
	const name = normalizeWorkspaceName(raw);
	if (!name) return 'Give the workspace a name.';
	if (sameName(name, 'inbox')) return 'INBOX is reserved for tasks without a workspace.';
	if (workspaces.some((w) => w.id !== exceptId && sameName(w.name, name))) {
		return `A workspace called ${name} already exists.`;
	}
	return '';
}

/* ---------- grouping ---------- */

/** The route id as a task's `workspaceId`: INBOX is "no workspace". */
export function workspaceKey(routeId: string): string | undefined {
	return routeId === INBOX_ID ? undefined : routeId;
}

/** Tasks of one workspace; `undefined` selects the INBOX. */
export function tasksIn(tasks: Task[], workspaceId: string | undefined): Task[] {
	return tasks.filter((t) => t.workspaceId === workspaceId);
}

export interface WorkspaceStats {
	open: number;
	done: number;
	total: number;
}

/** Counts for a card: pass only the active (not trashed) tasks of that workspace. */
export function workspaceStats(tasks: Task[]): WorkspaceStats {
	const done = tasks.filter((t) => t.done).length;
	return { open: tasks.length - done, done, total: tasks.length };
}

/* ---------- loading ---------- */

/** Validates untrusted workspaces: drops invalid, duplicate and surplus entries. */
export function toWorkspaces(data: unknown): Workspace[] {
	if (!Array.isArray(data)) return [];
	const result: Workspace[] = [];
	for (const raw of data) {
		if (result.length >= MAX_WORKSPACES) break;
		if (typeof raw !== 'object' || raw === null) continue;
		const w = raw as Record<string, unknown>;
		if (typeof w.id !== 'string' || !w.id || w.id.length > MAX_ID_LENGTH) continue;
		if (w.id === INBOX_ID || result.some((x) => x.id === w.id)) continue;
		if (typeof w.name !== 'string') continue;
		if (workspaceNameError(w.name, result) !== '') continue;
		result.push({ id: w.id, name: normalizeWorkspaceName(w.name) });
	}
	return result;
}

/**
 * Validates untrusted data. Accepts the current `{ workspaces, tasks }` document and the old
 * plain array of tasks (every task then belongs to the INBOX). Returns null for anything else.
 *
 * An active task pointing at a workspace that does not exist goes back to the INBOX. A trashed
 * task keeps its origin, so the trash can still say where it came from.
 */
export function toData(value: unknown): Data | null {
	let workspaces: Workspace[] = [];
	let rawTasks: unknown = value;
	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		const doc = value as Record<string, unknown>;
		workspaces = toWorkspaces(doc.workspaces);
		rawTasks = doc.tasks;
	}
	const tasks = toTasks(rawTasks);
	if (!tasks) return null;
	const known = new Set(workspaces.map((w) => w.id));
	for (const t of tasks) {
		if (t.workspaceId !== undefined && t.deletedAt === undefined && !known.has(t.workspaceId)) {
			delete t.workspaceId;
		}
	}
	return { workspaces, tasks };
}

/** Parse saved JSON; returns an empty document for anything missing or malformed. */
export function parseData(json: string | null): Data {
	const empty = (): Data => ({ workspaces: [], tasks: [] });
	if (!json) return empty();
	try {
		return toData(JSON.parse(json)) ?? empty();
	} catch {
		return empty();
	}
}
