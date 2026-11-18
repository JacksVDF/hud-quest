import { describe, expect, it } from 'vitest';
import {
	canShift,
	cellMark,
	describeDay,
	longDay,
	monthGrid,
	monthOf,
	monthTitle,
	shiftMonth,
	tallyByDay,
	tasksOn
} from './calendar';
import { weekdayOf } from './dates';
import type { Task } from './tasks';

const task = (over: Partial<Task> = {}): Task => ({
	id: Math.random().toString(36).slice(2),
	title: 'T',
	complexity: 'easy',
	done: false,
	tags: [],
	items: [],
	notes: '',
	...over
});

describe('weekdayOf', () => {
	it('counts from Monday', () => {
		expect(weekdayOf('2026-11-16')).toBe(0); // Monday
		expect(weekdayOf('2026-11-18')).toBe(2);
		expect(weekdayOf('2026-11-22')).toBe(6); // Sunday
	});
});

describe('months', () => {
	it('names and shifts months across years', () => {
		expect(monthTitle('2026-11')).toBe('NOVEMBER 2026');
		expect(monthOf('2026-11-18')).toBe('2026-11');
		expect(shiftMonth('2026-12', 1)).toBe('2027-01');
		expect(shiftMonth('2026-01', -1)).toBe('2025-12');
		expect(shiftMonth('2026-03', -1)).toBe('2026-02');
	});

	it('does not leave the supported years', () => {
		expect(canShift('1900-02', -1)).toBe(true);
		expect(canShift('1900-01', -1)).toBe(false);
		expect(canShift('2099-11', 1)).toBe(true);
		expect(canShift('2099-12', 1)).toBe(false);
	});

	it('writes a long date', () => {
		expect(longDay('2026-11-08')).toBe('November 8, 2026');
	});
});

describe('monthGrid', () => {
	it('is six whole weeks that start on a Monday', () => {
		for (const month of ['2026-11', '2026-02', '2027-02', '2024-02', '2026-03', '2025-09']) {
			const grid = monthGrid(month);
			expect(grid).toHaveLength(42);
			expect(weekdayOf(grid[0])).toBe(0);
			expect(grid).toContain(`${month}-01`);
			expect(grid.filter((d) => monthOf(d) === month).length).toBeGreaterThanOrEqual(28);
		}
	});

	it('fills the gaps with the neighbouring months', () => {
		const grid = monthGrid('2026-11'); // 1 Nov 2026 is a Sunday
		expect(grid[0]).toBe('2026-10-26');
		expect(grid[6]).toBe('2026-11-01');
		expect(grid[41]).toBe('2026-12-06');
	});

	it('starts on the 1st when it is a Monday', () => {
		expect(monthGrid('2026-06')[0]).toBe('2026-06-01');
	});

	it('has no repeated or missing day', () => {
		const grid = monthGrid('2026-03'); // a month where the clocks change in many countries
		expect(new Set(grid).size).toBe(42);
		expect(grid.at(-1)).toBe('2026-04-05');
	});
});

describe('tallyByDay', () => {
	const today = '2026-11-18';

	it('counts open, done and overdue tasks per due day', () => {
		const tally = tallyByDay(
			[
				task({ dueDate: '2026-11-18' }),
				task({ dueDate: '2026-11-18', done: true }),
				task({ dueDate: '2026-11-10' }),
				task({ dueDate: '2026-11-10', done: true }),
				task({ dueDate: '2026-11-20' }),
				task()
			],
			today
		);
		expect(tally['2026-11-18']).toEqual({ open: 1, done: 1, overdue: 0 });
		expect(tally['2026-11-10']).toEqual({ open: 1, done: 1, overdue: 1 });
		expect(tally['2026-11-20']).toEqual({ open: 1, done: 0, overdue: 0 });
		expect(Object.keys(tally)).toHaveLength(3);
	});

	it('ignores tasks without a due date', () => {
		expect(tallyByDay([task()], today)).toEqual({});
	});
});

describe('tasksOn', () => {
	it('lists the tasks of one day, open ones first', () => {
		const a = task({ id: 'a', dueDate: '2026-11-18', done: true });
		const b = task({ id: 'b', dueDate: '2026-11-18' });
		const c = task({ id: 'c', dueDate: '2026-11-19' });
		const d = task({ id: 'd', dueDate: '2026-11-18' });
		expect(tasksOn([a, b, c, d], '2026-11-18').map((t) => t.id)).toEqual(['b', 'd', 'a']);
		expect(tasksOn([a, b, c, d], '2026-11-30')).toEqual([]);
	});
});

describe('cell text', () => {
	it('marks late, open and finished days differently', () => {
		expect(cellMark(undefined)).toBe('');
		expect(cellMark({ open: 0, done: 0, overdue: 0 })).toBe('');
		expect(cellMark({ open: 2, done: 1, overdue: 0 })).toBe('■2');
		expect(cellMark({ open: 2, done: 0, overdue: 1 })).toBe('!2');
		expect(cellMark({ open: 0, done: 3, overdue: 0 })).toBe('[X]');
	});

	it('describes a day for a screen reader', () => {
		expect(describeDay('2026-11-18', undefined)).toBe('November 18, 2026: no tasks');
		expect(describeDay('2026-11-18', { open: 2, done: 1, overdue: 1 })).toBe(
			'November 18, 2026: 2 open, 1 overdue, 1 done'
		);
	});
});
