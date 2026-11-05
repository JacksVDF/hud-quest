import { error, json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { getTasks, MAX_BODY_BYTES, MAX_TASKS, saveTasks } from '#lib/server/db.ts';
import { toTasks } from '#lib/tasks.ts';
import type { RequestHandler } from './$types';

// Not part of the prerendered site: it needs the session and the database.
export const prerender = false;

/** The signed-in user's id. Everything below is scoped to it. */
function requireUserId(locals: App.Locals): string {
	if (!locals.user) error(401, 'Sign in to use your tasks.');
	return locals.user.id;
}

export const GET: RequestHandler = async ({ locals }) => {
	const userId = requireUserId(locals);
	return json(await getTasks(env.DB, userId), { headers: { 'cache-control': 'no-store' } });
};

/** Replaces the user's whole task list. */
export const PUT: RequestHandler = async ({ request, locals, url }) => {
	const userId = requireUserId(locals);

	// Cross-site pages cannot send JSON without a preflight, and we never answer one; the
	// Origin check is a second guard in case that ever changes.
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) error(403, 'Cross-origin request blocked.');
	if (!request.headers.get('content-type')?.startsWith('application/json')) {
		error(415, 'Send JSON.');
	}

	const text = await request.text();
	if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) error(413, 'Too much data.');

	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		error(400, 'Invalid JSON.');
	}

	const tasks = toTasks(body);
	if (!tasks) error(400, 'Expected a list of tasks.');
	if ((body as unknown[]).length !== tasks.length) error(400, 'The list has invalid tasks.');
	if (tasks.length > MAX_TASKS) error(413, `At most ${MAX_TASKS} tasks.`);

	await saveTasks(env.DB, userId, tasks);
	return json(tasks);
};
