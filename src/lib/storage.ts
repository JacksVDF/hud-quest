import { STORAGE_KEY } from './tasks';
import { parseData, type Data } from './workspaces';

/** Where the workspaces and tasks are persisted. Guests use the browser, signed-in users the API. */
export interface TaskStorage {
	load(): Data | Promise<Data>;
	/** May be async; a rejected promise means the save failed. */
	save(data: Data): void | Promise<void>;
}

/** What the guest kept in this browser (an old plain task list reads as INBOX tasks). Client only. */
export function readGuestData(): Data {
	return parseData(localStorage.getItem(STORAGE_KEY));
}

export function clearGuestData() {
	localStorage.removeItem(STORAGE_KEY);
}

/** Browser storage for guests. `localStorage` is read lazily, so it is safe to create on the server. */
export function createLocalStorage(): TaskStorage {
	return {
		load: readGuestData,
		save: (data) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
	};
}

/** The account data was saved from somewhere else since this tab loaded it. */
export class ConflictError extends Error {
	constructor() {
		super('Tasks changed somewhere else');
	}
}

/**
 * The version the server sent as ETag (`"3"` -> 3). Cloudflare turns strong ETags into
 * weak ones (`W/"3"`) when it compresses the response, so both forms must be accepted.
 */
export function versionOf(res: Response): number {
	const raw = res.headers.get('etag')?.replace(/^W\//, '').replaceAll('"', '');
	const n = raw ? Number(raw) : NaN;
	if (!Number.isInteger(n)) throw new Error('The server sent no version');
	return n;
}

/** The signed-in user's workspaces and tasks, kept in D1 through /api/tasks. */
export function createRemoteStorage(fetcher: typeof fetch = fetch): TaskStorage {
	// Saves are sent one after another, each based on the version the previous one produced.
	let queue: Promise<unknown> = Promise.resolve();
	let version: number | null = null;

	return {
		async load() {
			const res = await fetcher('/api/tasks');
			if (!res.ok) throw new Error(`Could not load tasks (${res.status})`);
			version = versionOf(res);
			return parseData(await res.text());
		},
		save(data) {
			const body = JSON.stringify(data);
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
