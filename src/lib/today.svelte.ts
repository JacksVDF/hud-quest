import { dayKey } from './dates';

/**
 * The player's current local day, kept fresh: it moves on at midnight even if the tab stays
 * open, and is re-read when the tab becomes visible again (timers sleep in background tabs).
 */
class Clock {
	today = $state(dayKey(Date.now()));

	#started = false;

	/** Starts following the clock. Safe to call more than once; client only. */
	start() {
		if (this.#started) return;
		this.#started = true;
		const refresh = () => (this.today = dayKey(Date.now()));
		document.addEventListener('visibilitychange', refresh);
		const schedule = () => {
			const now = new Date();
			const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
			setTimeout(
				() => {
					refresh();
					schedule();
				},
				midnight - now.getTime() + 1000
			);
		};
		schedule();
	}
}

export const clock = new Clock();
