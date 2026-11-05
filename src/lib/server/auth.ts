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
			customRules: {
				// Stricter for password guessing and mass sign-ups: 5 tries per minute.
				'/sign-in/email': { window: 60, max: 5 },
				'/sign-up/email': { window: 60, max: 5 }
			}
		},
		// Cloudflare sets this header and replaces any client value.
		advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
		plugins: [sveltekitCookies(getRequestEvent)]
	});
}

export type Auth = ReturnType<typeof createAuth>;
