import { parseTasks, type Task } from '#lib/tasks.ts';

/**
 * The only place that reads or writes a user's tasks. Every statement is scoped by
 * `user_id`, so one user can never reach another user's data through this module.
 */

/** Hard caps so one account cannot fill the database. */
export const MAX_TASKS = 500;
export const MAX_BODY_BYTES = 512 * 1024;

/** Version of a user who has never saved anything. */
export const NO_VERSION = 0;

export interface StoredTasks {
	tasks: Task[];
	/** Grows by one on every save; `NO_VERSION` when nothing was saved yet. */
	version: number;
}

export async function getTasks(db: D1Database, userId: string): Promise<StoredTasks> {
	const row = await db
		.prepare('SELECT tasks, version FROM user_tasks WHERE user_id = ?')
		.bind(userId)
		.first<{ tasks: string; version: number }>();
	return row
		? { tasks: parseTasks(row.tasks), version: row.version }
		: { tasks: [], version: NO_VERSION };
}

/**
 * Saves the list only if it is still at `expectedVersion`. Returns the new version, or
 * null when someone else saved first (the caller must reload and retry).
 */
export async function saveTasks(
	db: D1Database,
	userId: string,
	tasks: Task[],
	expectedVersion: number
): Promise<number | null> {
	const json = JSON.stringify(tasks);
	const now = Date.now();
	const result =
		expectedVersion === NO_VERSION
			? await db
					.prepare(
						`INSERT INTO user_tasks (user_id, tasks, updated_at, version) VALUES (?, ?, ?, 1)
						 ON CONFLICT (user_id) DO NOTHING`
					)
					.bind(userId, json, now)
					.run()
			: await db
					.prepare(
						`UPDATE user_tasks SET tasks = ?, updated_at = ?, version = version + 1
						 WHERE user_id = ? AND version = ?`
					)
					.bind(json, now, userId, expectedVersion)
					.run();
	return result.meta.changes === 1 ? expectedVersion + 1 : null;
}
