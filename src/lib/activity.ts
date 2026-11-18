import { addDays, isDayKey } from './dates';
import { COMPLEXITIES, type Complexity } from './xp';

/**
 * A small per-day record of what the player achieved. Streaks and statistics read it instead of
 * the task list, so deleting a task or emptying the trash never rewrites history.
 */
export interface DayActivity {
	easy: number;
	medium: number;
	hard: number;
	xp: number;
}

/** Keyed by local day (`YYYY-MM-DD`). Days with nothing done are not stored. */
export type Activity = Record<string, DayActivity>;

/** Only the most recent days are kept. */
export const MAX_ACTIVITY_DAYS = 365;
const MAX_COUNT = 10_000;
const MAX_XP = 1_000_000;

const tasksOf = (d: DayActivity) => d.easy + d.medium + d.hard;
const isEmpty = (d: DayActivity) => tasksOf(d) === 0 && d.xp === 0;
const clamp = (n: number, max: number) => Math.min(max, Math.max(0, n));

/** Keeps the newest `MAX_ACTIVITY_DAYS` days. */
export function pruneActivity(activity: Activity): Activity {
	const days = Object.keys(activity).sort();
	if (days.length <= MAX_ACTIVITY_DAYS) return activity;
	const result: Activity = {};
	for (const day of days.slice(-MAX_ACTIVITY_DAYS)) result[day] = activity[day];
	return result;
}

/** Validates untrusted data: drops bad days and bad numbers, never throws. */
export function toActivity(value: unknown): Activity {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
	const result: Activity = {};
	for (const [day, raw] of Object.entries(value)) {
		if (!isDayKey(day) || typeof raw !== 'object' || raw === null) continue;
		const r = raw as Record<string, unknown>;
		const whole = (n: unknown, max: number) =>
			typeof n === 'number' && Number.isInteger(n) ? clamp(n, max) : 0;
		const entry: DayActivity = {
			easy: whole(r.easy, MAX_COUNT),
			medium: whole(r.medium, MAX_COUNT),
			hard: whole(r.hard, MAX_COUNT),
			xp: whole(r.xp, MAX_XP)
		};
		if (!isEmpty(entry)) result[day] = entry;
	}
	return pruneActivity(result);
}

function update(
	activity: Activity,
	day: string,
	change: (entry: DayActivity) => DayActivity
): Activity {
	const entry = change({ ...(activity[day] ?? { easy: 0, medium: 0, hard: 0, xp: 0 }) });
	const result = { ...activity };
	if (isEmpty(entry)) delete result[day];
	else result[day] = entry;
	return pruneActivity(result);
}

/** Counts a completed task on `day`; use `-1` to take it back (never goes below zero). */
export function recordTask(
	activity: Activity,
	day: string,
	complexity: Complexity,
	amount: 1 | -1
): Activity {
	return update(activity, day, (e) => ({
		...e,
		[complexity]: clamp(e[complexity] + amount, MAX_COUNT)
	}));
}

/** Adds (or, when negative, removes) XP on `day`; a day never goes below zero. */
export function recordXp(activity: Activity, day: string, delta: number): Activity {
	if (delta === 0) return activity;
	return update(activity, day, (e) => ({ ...e, xp: clamp(e.xp + delta, MAX_XP) }));
}

/** Adds the days of `extra` to `activity` (used when a guest's progress joins an account). */
export function mergeActivity(activity: Activity, extra: Activity): Activity {
	let result = activity;
	for (const [day, e] of Object.entries(extra)) {
		for (const c of COMPLEXITIES) {
			for (let i = 0; i < e[c]; i++) result = recordTask(result, day, c, 1);
		}
		result = recordXp(result, day, e.xp);
	}
	return result;
}

/* ---------- streaks ---------- */

/** A day counts for the streak when at least one task was completed on it. */
const isActive = (activity: Activity, day: string) => {
	const e = activity[day];
	return e !== undefined && tasksOf(e) > 0;
};

/**
 * Consecutive active days up to today. Today may still be empty without breaking the streak:
 * it ends only when a whole day passes with nothing done.
 */
export function currentStreak(activity: Activity, today: string): number {
	let day = isActive(activity, today) ? today : addDays(today, -1);
	let count = 0;
	while (isActive(activity, day)) {
		count++;
		day = addDays(day, -1);
	}
	return count;
}

/** The longest run of consecutive active days in the kept history. */
export function bestStreak(activity: Activity): number {
	const days = Object.keys(activity)
		.filter((d) => isActive(activity, d))
		.sort();
	let best = 0;
	let run = 0;
	let previous = '';
	for (const day of days) {
		run = previous !== '' && addDays(previous, 1) === day ? run + 1 : 1;
		best = Math.max(best, run);
		previous = day;
	}
	return best;
}

/* ---------- statistics ---------- */

export interface Totals {
	easy: number;
	medium: number;
	hard: number;
	tasks: number;
	xp: number;
}

/** Sums the last `days` days, today included. */
export function totalsFor(activity: Activity, today: string, days: number): Totals {
	const totals: Totals = { easy: 0, medium: 0, hard: 0, tasks: 0, xp: 0 };
	for (let i = 0; i < days; i++) {
		const e = activity[addDays(today, -i)];
		if (!e) continue;
		totals.easy += e.easy;
		totals.medium += e.medium;
		totals.hard += e.hard;
		totals.xp += e.xp;
	}
	totals.tasks = totals.easy + totals.medium + totals.hard;
	return totals;
}

export interface DayBar {
	day: string;
	tasks: number;
	xp: number;
}

/** One entry per day for the last `days` days, oldest first, for the bar chart. */
export function lastDays(activity: Activity, today: string, days: number): DayBar[] {
	const bars: DayBar[] = [];
	for (let i = days - 1; i >= 0; i--) {
		const day = addDays(today, -i);
		const e = activity[day];
		bars.push({ day, tasks: e ? tasksOf(e) : 0, xp: e?.xp ?? 0 });
	}
	return bars;
}
