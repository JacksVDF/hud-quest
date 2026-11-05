import { STORAGE_KEY, parseTasks, type Task } from './tasks';

/** Where the task list is persisted. Guests use the browser, signed-in users use the API. */
export interface TaskStorage {
	load(): Task[] | Promise<Task[]>;
	/** May be async; a rejected promise means the save failed. */
	save(tasks: Task[]): void | Promise<void>;
}

/** The guest list kept in this browser. Only call on the client. */
export function readGuestTasks(): Task[] {
	return parseTasks(localStorage.getItem(STORAGE_KEY));
}

export function clearGuestTasks() {
	localStorage.removeItem(STORAGE_KEY);
}

/** Browser storage for guests. `localStorage` is read lazily, so it is safe to create on the server. */
export function createLocalStorage(): TaskStorage {
	return {
		load: readGuestTasks,
		save: (tasks) => localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
	};
}

/** The account list was saved from somewhere else since this tab loaded it. */
export class ConflictError extends Error {
	constructor() {
		super('Tasks changed somewhere else');
	}
}

/** The version the server sent as ETag (`"3"` -> 3). */
function versionOf(res: Response): number {
	const n = Number(res.headers.get('etag')?.replaceAll('"', ''));
	if (!Number.isInteger(n)) throw new Error('The server sent no version');
	return n;
}

/** The signed-in user's tasks, kept in D1 through /api/tasks. */
export function createRemoteStorage(fetcher: typeof fetch = fetch): TaskStorage {
	// Saves are sent one after another, each based on the version the previous one produced.
	let queue: Promise<unknown> = Promise.resolve();
	let version: number | null = null;

	return {
		async load() {
			const res = await fetcher('/api/tasks');
			if (!res.ok) throw new Error(`Could not load tasks (${res.status})`);
			version = versionOf(res);
			return parseTasks(JSON.stringify(await res.json()));
		},
		save(tasks) {
			const body = JSON.stringify(tasks);
			const send = async () => {
				if (version === null) throw new Error('Tasks were not loaded');
				const res = await fetcher('/api/tasks', {
					method: 'PUT',
					headers: { 'content-type': 'application/json', 'if-match': `"${version}"` },
					body
				});
				if (res.status === 412) throw new ConflictError();
				if (!res.ok) throw new Error(`Could not save tasks (${res.status})`);
				version = versionOf(res);
			};
			const result = queue.then(send);
			queue = result.catch(() => {});
			return result;
		}
	};
}
