import { parseData, type Data } from '#lib/workspaces.ts';

/**
 * The only place that reads or writes a user's workspaces and tasks. Every statement is scoped by
 * `user_id`, so one user can never reach another user's data through this module.
 */

/** Hard caps so one account cannot fill the database. */
export const MAX_TASKS = 500;
export const MAX_BODY_BYTES = 512 * 1024;

/** Version of a user who has never saved anything. */
export const NO_VERSION = 0;

export interface StoredData {
	data: Data;
	/** Grows by one on every save; `NO_VERSION` when nothing was saved yet. */
	version: number;
}

export async function getData(db: D1Database, userId: string): Promise<StoredData> {
	const row = await db
		.prepare('SELECT data, version FROM user_data WHERE user_id = ?')
		.bind(userId)
		.first<{ data: string; version: number }>();
	return row
		? { data: parseData(row.data), version: row.version }
		: { data: { workspaces: [], tasks: [] }, version: NO_VERSION };
}

/**
 * Saves the data only if it is still at `expectedVersion`. Returns the new version, or
 * null when someone else saved first (the caller must reload and retry).
 */
export async function saveData(
	db: D1Database,
	userId: string,
	data: Data,
	expectedVersion: number
): Promise<number | null> {
	const json = JSON.stringify(data);
	const now = Date.now();
	const result =
		expectedVersion === NO_VERSION
			? await db
					.prepare(
						`INSERT INTO user_data (user_id, data, updated_at, version) VALUES (?, ?, ?, 1)
						 ON CONFLICT (user_id) DO NOTHING`
					)
					.bind(userId, json, now)
					.run()
			: await db
					.prepare(
						`UPDATE user_data SET data = ?, updated_at = ?, version = version + 1
						 WHERE user_id = ? AND version = ?`
					)
					.bind(json, now, userId, expectedVersion)
					.run();
	return result.meta.changes === 1 ? expectedVersion + 1 : null;
}
