import { authClient } from './auth-client';

/**
 * Who is signed in, as seen by the browser. Pages are prerendered, so this is
 * fetched on the client with `refresh()` instead of coming from a server load.
 */
class Session {
	/** Null for guests (and until the first refresh finishes). */
	email = $state<string | null>(null);
	/** False until the first refresh finishes, so the UI does not flash the guest state. */
	ready = $state(false);

	async refresh() {
		const { data } = await authClient.getSession();
		this.email = data?.user.email ?? null;
		this.ready = true;
	}

	async signOut() {
		await authClient.signOut();
		this.email = null;
	}
}

export const session = new Session();
