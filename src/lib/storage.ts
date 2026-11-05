import { STORAGE_KEY, parseTasks, type Task } from './tasks';

/** Where the task list is persisted. Guests use the browser, users will use the API. */
export interface TaskStorage {
	load(): Task[];
	save(tasks: Task[]): void;
}

/** Browser storage for guests. `localStorage` is read lazily, so it is safe to create on the server. */
export function createLocalStorage(): TaskStorage {
	return {
		load: () => parseTasks(localStorage.getItem(STORAGE_KEY)),
		save: (tasks) => localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
	};
}
