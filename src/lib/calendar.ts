/**
 * Pure helpers for the month calendar. Days are `YYYY-MM-DD` strings and months `YYYY-MM`,
 * so nothing here does millisecond maths. Weeks start on Monday.
 */
import { addDays, addMonths, weekdayOf } from './dates';
import type { Task } from './tasks';

export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

/** The calendar never leaves the years that saved dates are allowed to have. */
const FIRST_MONTH = '1900-01';
const LAST_MONTH = '2099-12';

export const monthOf = (day: string) => day.slice(0, 7);

/** `NOVEMBER 2026` */
export function monthTitle(month: string): string {
	const [y, m] = month.split('-');
	return `${MONTH_NAMES[Number(m) - 1].toUpperCase()} ${y}`;
}

/** `November 18, 2026`, for screen readers. */
export function longDay(day: string): string {
	const [y, m, d] = day.split('-');
	return `${MONTH_NAMES[Number(m) - 1]} ${Number(d)}, ${y}`;
}

/** The month `n` months away; `n` may be negative. */
export function shiftMonth(month: string, n: number): string {
	return monthOf(addMonths(`${month}-01`, n));
}

/** False when going `n` months away would leave the supported years. */
export function canShift(month: string, n: number): boolean {
	const target = shiftMonth(month, n);
	return target >= FIRST_MONTH && target <= LAST_MONTH;
}

/**
 * Six whole weeks (42 days) that cover the month, starting on a Monday. The same size every
 * month keeps the page from jumping when the month changes; days of the neighbouring months
 * fill the gaps.
 */
export function monthGrid(month: string): string[] {
	const first = `${month}-01`;
	const start = addDays(first, -weekdayOf(first));
	return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export type DayTally = { open: number; done: number; overdue: number };

/** What is due on each day: tasks still open, tasks done, and open ones that are late. */
export function tallyByDay(tasks: Task[], today: string): Record<string, DayTally> {
	const tally: Record<string, DayTally> = {};
	for (const task of tasks) {
		if (!task.dueDate) continue;
		const day = (tally[task.dueDate] ??= { open: 0, done: 0, overdue: 0 });
		if (task.done) day.done++;
		else {
			day.open++;
			if (task.dueDate < today) day.overdue++;
		}
	}
	return tally;
}

/** The tasks due on a day: open ones first, then done ones, each group in list order. */
export function tasksOn(tasks: Task[], day: string): Task[] {
	const due = tasks.filter((t) => t.dueDate === day);
	return [...due.filter((t) => !t.done), ...due.filter((t) => t.done)];
}

/** The short text inside a day cell: `!2` when something is late, `■2` when open, `[X]` when done. */
export function cellMark(tally: DayTally | undefined): string {
	if (!tally) return '';
	if (tally.overdue > 0) return `!${tally.open}`;
	if (tally.open > 0) return `■${tally.open}`;
	return tally.done > 0 ? '[X]' : '';
}

/** What a screen reader says for a day cell, e.g. `November 18, 2026: 2 open, 1 done`. */
export function describeDay(day: string, tally: DayTally | undefined): string {
	if (!tally) return `${longDay(day)}: no tasks`;
	const parts = [];
	if (tally.open > 0) parts.push(`${tally.open} open`);
	if (tally.overdue > 0) parts.push(`${tally.overdue} overdue`);
	if (tally.done > 0) parts.push(`${tally.done} done`);
	return `${longDay(day)}: ${parts.join(', ')}`;
}
