import { describe, expect, it } from 'vitest';
import { addDays, addMonths, dayKey, dueState, formatDay, isDayKey, nextDue } from './dates';

describe('dayKey', () => {
	it('uses the local calendar day', () => {
		expect(dayKey(new Date(2026, 10, 3, 23, 59).getTime())).toBe('2026-11-03');
		expect(dayKey(new Date(2026, 10, 4, 0, 1).getTime())).toBe('2026-11-04');
	});
});

describe('isDayKey', () => {
	it('accepts real days only', () => {
		expect(isDayKey('2026-02-28')).toBe(true);
		expect(isDayKey('2028-02-29')).toBe(true);
		expect(isDayKey('2026-02-29')).toBe(false);
		expect(isDayKey('2026-13-01')).toBe(false);
		expect(isDayKey('2026-2-1')).toBe(false);
		expect(isDayKey('0026-02-01')).toBe(false);
		expect(isDayKey(20260201)).toBe(false);
		expect(isDayKey(undefined)).toBe(false);
	});
});

describe('addDays / addMonths', () => {
	it('crosses month and year ends', () => {
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});
	it('is not thrown off by daylight saving changes', () => {
		expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
		expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
		expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
	});
	it('clamps to the last day of a shorter month', () => {
		expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
		expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
		expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
	});
});

describe('nextDue', () => {
	it('moves one step ahead of the due date', () => {
		expect(nextDue('2026-11-03', 'daily', '2026-11-03')).toBe('2026-11-04');
		expect(nextDue('2026-11-03', 'weekly', '2026-11-03')).toBe('2026-11-10');
		expect(nextDue('2026-11-03', 'monthly', '2026-11-03')).toBe('2026-12-03');
	});
	it('skips the dates already in the past', () => {
		expect(nextDue('2026-11-01', 'daily', '2026-11-10')).toBe('2026-11-11');
		expect(nextDue('2026-11-01', 'weekly', '2026-11-20')).toBe('2026-11-22');
	});
	it('keeps the original day of the month after a short month', () => {
		expect(nextDue('2026-01-31', 'monthly', '2026-02-01')).toBe('2026-02-28');
		expect(nextDue('2026-01-31', 'monthly', '2026-03-01')).toBe('2026-03-31');
	});
});

describe('dueState', () => {
	it('compares against today', () => {
		expect(dueState('2026-11-02', false, '2026-11-03')).toBe('overdue');
		expect(dueState('2026-11-03', false, '2026-11-03')).toBe('today');
		expect(dueState('2026-11-04', false, '2026-11-03')).toBe('upcoming');
	});
	it('has no state without a date or when done', () => {
		expect(dueState(undefined, false, '2026-11-03')).toBeNull();
		expect(dueState('2026-11-02', true, '2026-11-03')).toBeNull();
	});
});

describe('formatDay', () => {
	it('adds the year only when it is not this one', () => {
		expect(formatDay('2026-11-03', '2026-06-01')).toBe('NOV 03');
		expect(formatDay('2027-01-09', '2026-06-01')).toBe('JAN 09 2027');
	});
});
