import { authClient } from './auth-client';

/**
 * Set once an account has been seen on this device. It holds no account data, only the fact
 * that one signed in, so an offline start can tell "a signed-in user without a connection"
 * from "a guest" and does not show the guest's tasks (or a LOGIN button) to the wrong person.
 */
export const ACCOUNT_FLAG = 'hud-quest-todo:account';

/**
 * Who is signed in, as seen by the browser. Pages are prerendered, so this is
 * fetched on the client with `refresh()` instead of coming from a server load.
 */
class Session {
	/** Null for guests (and until the first refresh finishes). */
	email = $state<string | null>(null);
	/** False until the first refresh finishes, so the UI does not flash the guest state. */
	ready = $state(false);
	/** The server could not be reached, so who is signed in is unknown. */
	offline = $state(false);
	/** An account signed in on this device before; only read when the session is unknown. */
	#hadAccount = $state(false);

	/**
	 * Offline and a signed-in user was here before: the account tasks cannot be shown (they are
	 * never kept on the device), and the guest tasks must not be shown in their place.
	 */
	blocked = $derived(this.offline && this.#hadAccount);

	async refresh() {
		try {
			const { data, error } = await authClient.getSession();
			// The client reports a request that never reached the server as a "Fetch Error".
			if (error?.statusText === 'Fetch Error') throw new Error('offline');
			this.email = data?.user.email ?? null;
			this.offline = false;
			if (this.email) localStorage.setItem(ACCOUNT_FLAG, '1');
			else localStorage.removeItem(ACCOUNT_FLAG);
		} catch {
			this.email = null;
			this.offline = true;
			this.#hadAccount = localStorage.getItem(ACCOUNT_FLAG) === '1';
		}
		this.ready = true;
	}

	async signOut() {
		await authClient.signOut();
		this.email = null;
		localStorage.removeItem(ACCOUNT_FLAG);
	}
}

export const session = new Session();
