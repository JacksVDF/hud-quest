// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
/// <reference types="@cloudflare/workers-types" />

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: { id: string; email: string; name: string } | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	/** Bindings and secrets of the Worker (see wrangler.jsonc and .dev.vars). */
	namespace Cloudflare {
		interface Env {
			DB: D1Database;
			BETTER_AUTH_SECRET: string;
			BETTER_AUTH_URL?: string;
		}
	}
}

export {};
