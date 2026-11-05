import { STORAGE_KEY, parseTasks, type Task } from './tasks';

/** Where the task list is persisted. Guests use the browser, signed-in users use the API. */
export interface TaskStorage {
	load(): Task[] | Promise<Task[]>;
	/** May be async; a rejected promise means the save failed. */
	save(tasks: Task[]): void | Promise<void>;
}

/** Browser storage for guests. `localStorage` is read lazily, so it is safe to create on the server. */
export function createLocalStorage(): TaskStorage {
	return {
		load: () => parseTasks(localStorage.getItem(STORAGE_KEY)),
		save: (tasks) => localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
	};
}

/** The signed-in user's tasks, kept in D1 through /api/tasks. */
export function createRemoteStorage(fetcher: typeof fetch = fetch): TaskStorage {
	// Saves are sent one after another so an older list can never overwrite a newer one.
	let queue: Promise<unknown> = Promise.resolve();

	return {
		async load() {
			const res = await fetcher('/api/tasks');
			if (!res.ok) throw new Error(`Could not load tasks (${res.status})`);
			return parseTasks(JSON.stringify(await res.json()));
		},
		save(tasks) {
			const body = JSON.stringify(tasks);
			const send = async () => {
				const res = await fetcher('/api/tasks', {
					method: 'PUT',
					headers: { 'content-type': 'application/json' },
					body
				});
				if (!res.ok) throw new Error(`Could not save tasks (${res.status})`);
			};
			const result = queue.then(send);
			queue = result.catch(() => {});
			return result;
		}
	};
}
