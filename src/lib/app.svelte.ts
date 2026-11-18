import { notice } from './notice.svelte';
import { session } from './session.svelte';
import { clearGuestData, createLocalStorage, createRemoteStorage, readGuestData } from './storage';
import { taskStore } from './task-store.svelte';
import type { Data } from './workspaces';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Counts as a short phrase: "2 tasks and 1 workspace". Workspaces are left out when zero. */
export function describeCounts(tasks: number, workspaces: number): string {
	const parts = [plural(tasks, 'task')];
	if (workspaces > 0) parts.push(plural(workspaces, 'workspace'));
	return parts.join(' and ');
}

/**
 * Starts the app on whichever page is opened first: finds out who is signed in and loads
 * their workspaces and tasks. The store is shared, so moving between pages does not reload it.
 */
class App {
	/** Data made as a guest in this browser, offered to the account once after logging in. */
	guest = $state<Data | null>(null);
	importFailed = $state(false);

	/** Who the loaded data belongs to: an email, null for a guest, undefined for nobody yet. */
	#loadedFor: string | null | undefined = undefined;
	#dismissed = false;

	async start() {
		// Moving between pages keeps the answer; a full page load asks again.
		// An unreachable server is asked again on every page, so coming back online recovers.
		if (!session.ready || session.offline) await session.refresh();
		// Offline with an account that was here before: its tasks are not on this device, and
		// the guest's must not be shown in their place.
		if (session.blocked) {
			this.#loadedFor = undefined;
			this.guest = null;
			return;
		}
		const who = session.email;
		if (this.#loadedFor !== who || !taskStore.loaded) {
			if (this.#loadedFor !== who) this.#dismissed = false;
			this.#loadedFor = who;
			await taskStore.useStorage(who ? createRemoteStorage() : createLocalStorage());
		}
		this.guest = who && !this.#dismissed ? this.#readGuest() : null;
	}

	#readGuest(): Data | null {
		const data = readGuestData();
		return data.tasks.length > 0 || data.workspaces.length > 0 ? data : null;
	}

	dismissGuest() {
		this.#dismissed = true;
		this.guest = null;
	}

	async importGuest() {
		if (!this.guest) return;
		this.importFailed = false;
		try {
			const added = await taskStore.importData(this.guest);
			clearGuestData();
			this.guest = null;
			notice.say(
				`[✓] Imported ${describeCounts(added.tasks, added.workspaces)} into your account.`
			);
		} catch {
			this.importFailed = true;
		}
	}

	/** The connection came back: find out who is signed in and load their tasks. */
	reconnect() {
		if (session.offline) void this.start();
	}

	async signOut() {
		this.guest = null;
		this.#dismissed = false;
		await session.signOut();
		this.#loadedFor = null;
		await taskStore.useStorage(createLocalStorage());
	}
}

export const app = new App();
