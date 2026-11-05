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

	const auth = createAuth(env, event.url.origin);
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.user = session
		? { id: session.user.id, email: session.user.email, name: session.user.name }
		: null;

	return svelteKitHandler({ auth, event, resolve, building });
};
