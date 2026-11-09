import type { Change } from './task-store.svelte';

/** The one message line shown under the task form, shared by every page. */
class Notice {
	message = $state('');
	/** Changes with every message, so the same text twice in a row restarts the countdown. */
	key = $state(0);

	say(text: string) {
		this.message = text;
		this.key++;
	}

	clear() {
		this.message = '';
	}

	/** Turns an XP change into feedback; clears the line when nothing changed. */
	announce(change: Change | null, up: string, down: string) {
		if (!change || change.delta === 0) {
			this.clear();
		} else if (change.delta > 0) {
			this.say(
				change.levelAfter > change.levelBefore
					? `[✓] LEVEL UP! You reached level ${change.levelAfter}. +${change.delta} XP.`
					: `[✓] ${up}: +${change.delta} XP.`
			);
		} else {
			this.say(`[!] ${down}: ${change.delta} XP.`);
		}
	}
}

export const notice = new Notice();
