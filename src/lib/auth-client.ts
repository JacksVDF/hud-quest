import { createAuthClient } from 'better-auth/svelte';

/** Browser client for the Better Auth endpoints served under /api/auth. */
export const authClient = createAuthClient();
