import { parseTasks, type Task } from '#lib/tasks.ts';

/**
 * The only place that reads or writes a user's tasks. Every statement is scoped by
 * `user_id`, so one user can never reach another user's data through this module.
 */

/** Hard caps so one account cannot fill the database. */
export const MAX_TASKS = 500;
export const MAX_BODY_BYTES = 512 * 1024;

export async function getTasks(db: D1Database, userId: string): Promise<Task[]> {
	const row = await db
		.prepare('SELECT tasks FROM user_tasks WHERE user_id = ?')
		.bind(userId)
		.first<{ tasks: string }>();
	return parseTasks(row?.tasks ?? null);
}

export async function saveTasks(db: D1Database, userId: string, tasks: Task[]): Promise<void> {
	await db
		.prepare(
			`INSERT INTO user_tasks (user_id, tasks, updated_at) VALUES (?, ?, ?)
			 ON CONFLICT (user_id) DO UPDATE SET tasks = excluded.tasks, updated_at = excluded.updated_at`
		)
		.bind(userId, JSON.stringify(tasks), Date.now())
		.run();
}
