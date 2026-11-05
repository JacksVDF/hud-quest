import type { Handle } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { env } from 'cloudflare:workers';
import { building } from '$app/env';
import { createAuth } from '#lib/server/auth.ts';

export const handle: Handle = async ({ event, resolve }) => {
	// `cloudflare:workers` cannot be read while prerendering; those pages never use the user.
	if (building) {
		event.locals.user = null;
		return resolve(event);
	}

	// Without a password Better Auth only needs a recent session, so a stolen cookie could
	// delete the account. Always require the password.
	if (event.url.pathname === '/api/auth/delete-user') {
		const body: unknown = await event.request
			.clone()
			.json()
			.catch(() => null);
		const password = (body as { password?: unknown } | null)?.password;
		if (typeof password !== 'string' || password === '') {
			return Response.json({ message: 'Password required' }, { status: 400 });
		}
	}

	const auth = createAuth(env, event.url.origin);
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.user = session
		? { id: session.user.id, email: session.user.email, name: session.user.name }
		: null;

	return svelteKitHandler({ auth, event, resolve, building });
};
