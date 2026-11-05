import { betterAuth } from 'better-auth';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

/**
 * Better Auth bound to this request's D1 database. A new instance per request is cheap and
 * needed because the D1 binding only exists inside a request.
 */
export function createAuth(env: Cloudflare.Env, baseURL: string) {
	return betterAuth({
		database: env.DB,
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL ?? baseURL,
		emailAndPassword: {
			enabled: true,
			minPasswordLength: MIN_PASSWORD_LENGTH,
			maxPasswordLength: MAX_PASSWORD_LENGTH,
			// No email verification in V1 (agreed); the rate limit below is the guard.
			requireEmailVerification: false,
			autoSignIn: true
		},
		// In-memory counters are useless on Workers (each request may hit a new isolate).
		rateLimit: {
			enabled: true,
			storage: 'database',
			window: 60,
			max: 30,
			// Counters are per IP and per path, so each rule below has its own bucket.
			customRules: {
				// Password guessing: room for typos, still slow for a bot (each try costs a hash).
				'/sign-in/email': { window: 60, max: 10 },
				// Mass sign-ups.
				'/sign-up/email': { window: 60, max: 5 },
				// The page asks for the session on every load, so reloads must not lock anyone out.
				'/get-session': { window: 60, max: 120 }
			}
		},
		// Cloudflare sets this header and replaces any client value.
		advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
		plugins: [sveltekitCookies(getRequestEvent)]
	});
}

export type Auth = ReturnType<typeof createAuth>;
