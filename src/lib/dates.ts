/**
 * Calendar days as `YYYY-MM-DD` strings in the player's own time zone. They sort and compare
 * as plain strings, and they do not drift with daylight saving time like millisecond maths does.
 */

/** Years 1900-2099 only, so `new Date(y, ...)` never treats a year as 19xx. */
const DAY_PATTERN = /^(?:19|20)\d{2}-\d{2}-\d{2}$/;

const pad = (n: number) => String(n).padStart(2, '0');

function format(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parse(day: string): Date {
	const [y, m, d] = day.split('-').map(Number);
	return new Date(y, m - 1, d);
}

/** The local day a moment (ms since epoch) falls on. */
export function dayKey(ms: number): string {
	return format(new Date(ms));
}

/** True for a real calendar day such as `2026-02-28` (not `2026-02-30`). */
export function isDayKey(value: unknown): value is string {
	return typeof value === 'string' && DAY_PATTERN.test(value) && format(parse(value)) === value;
}

export function addDays(day: string, n: number): string {
	const d = parse(day);
	d.setDate(d.getDate() + n);
	return format(d);
}

/** Adds whole months; a day that does not exist in the target month becomes its last day. */
export function addMonths(day: string, n: number): string {
	const d = parse(day);
	const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
	const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
	target.setDate(Math.min(d.getDate(), lastDay));
	return format(target);
}

export const REPEATS = ['daily', 'weekly', 'monthly'] as const;
export type Repeat = (typeof REPEATS)[number];

function step(due: string, repeat: Repeat, k: number): string {
	if (repeat === 'daily') return addDays(due, k);
	if (repeat === 'weekly') return addDays(due, 7 * k);
	return addMonths(due, k);
}

/**
 * The due date of the next occurrence: the first date in the series that is after `today`.
 * An overdue daily task completed today therefore comes back tomorrow, not today.
 */
export function nextDue(due: string, repeat: Repeat, today: string): string {
	let k = 1;
	let next = step(due, repeat, k);
	while (next <= today) next = step(due, repeat, ++k);
	return next;
}

export type DueState = 'overdue' | 'today' | 'upcoming';

/** Where a task stands against its due date. Done tasks and tasks without a date have none. */
export function dueState(
	dueDate: string | undefined,
	done: boolean,
	today: string
): DueState | null {
	if (!dueDate || done) return null;
	if (dueDate < today) return 'overdue';
	return dueDate === today ? 'today' : 'upcoming';
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** `NOV 03`, with the year added when it is not the current one: `NOV 03 2027`. */
export function formatDay(day: string, today: string): string {
	const [y, m, d] = day.split('-');
	const base = `${MONTHS[Number(m) - 1]} ${d}`;
	return y === today.slice(0, 4) ? base : `${base} ${y}`;
}
