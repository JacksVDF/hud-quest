import { describe, expect, it } from 'vitest';
import {
	MAX_ACTIVITY_DAYS,
	bestStreak,
	currentStreak,
	lastDays,
	mergeActivity,
	recordTask,
	recordXp,
	toActivity,
	totalsFor,
	type Activity
} from './activity';
import { addDays } from './dates';

const day = (easy = 1, xp = 10) => ({ easy, medium: 0, hard: 0, xp });
const TODAY = '2026-11-10';

describe('recordTask / recordXp', () => {
	it('counts a task and its xp on the day', () => {
		const a = recordXp(recordTask({}, TODAY, 'medium', 1), TODAY, 25);
		expect(a[TODAY]).toEqual({ easy: 0, medium: 1, hard: 0, xp: 25 });
	});
	it('does not change the object it was given', () => {
		const a: Activity = { [TODAY]: day() };
		recordTask(a, TODAY, 'easy', 1);
		expect(a[TODAY].easy).toBe(1);
	});
	it('takes a task back and drops the day when nothing is left', () => {
		let a = recordXp(recordTask({}, TODAY, 'easy', 1), TODAY, 10);
		a = recordXp(recordTask(a, TODAY, 'easy', -1), TODAY, -10);
		expect(a).toEqual({});
	});
	it('never goes below zero', () => {
		expect(recordTask({}, TODAY, 'easy', -1)).toEqual({});
		expect(recordXp({ [TODAY]: day(1, 10) }, TODAY, -500)[TODAY].xp).toBe(0);
	});
	it('keeps only the newest days', () => {
		let a: Activity = {};
		for (let i = 0; i < MAX_ACTIVITY_DAYS + 5; i++)
			a = recordTask(a, addDays('2025-01-01', i), 'easy', 1);
		expect(Object.keys(a)).toHaveLength(MAX_ACTIVITY_DAYS);
		expect(a['2025-01-01']).toBeUndefined();
	});
});

describe('toActivity', () => {
	it('keeps valid days and drops everything else', () => {
		const result = toActivity({
			[TODAY]: { easy: 2, medium: 1, hard: 0, xp: 45 },
			'2026-02-30': day(),
			nope: day(),
			'2026-11-09': 'x',
			'2026-11-08': { easy: -4, medium: 1.5, hard: 'a', xp: 1e12 }
		});
		expect(Object.keys(result)).toEqual([TODAY, '2026-11-08']);
		expect(result['2026-11-08']).toEqual({ easy: 0, medium: 0, hard: 0, xp: 1_000_000 });
	});
	it('reads anything that is not an object as empty', () => {
		expect(toActivity(null)).toEqual({});
		expect(toActivity([1, 2])).toEqual({});
		expect(toActivity('x')).toEqual({});
	});
});

describe('mergeActivity', () => {
	it('adds the days of both', () => {
		const merged = mergeActivity(
			{ [TODAY]: day(1, 10) },
			{ [TODAY]: day(2, 20), '2026-11-09': day(1, 10) }
		);
		expect(merged[TODAY]).toEqual({ easy: 3, medium: 0, hard: 0, xp: 30 });
		expect(merged['2026-11-09']).toEqual(day(1, 10));
	});
});

describe('currentStreak', () => {
	it('is 0 without activity', () => {
		expect(currentStreak({}, TODAY)).toBe(0);
	});
	it('counts consecutive days including today', () => {
		const a = { [TODAY]: day(), '2026-11-09': day(), '2026-11-08': day() };
		expect(currentStreak(a, TODAY)).toBe(3);
	});
	it('survives an empty today, and ends after a whole empty day', () => {
		const a = { '2026-11-09': day(), '2026-11-08': day() };
		expect(currentStreak(a, TODAY)).toBe(2);
		expect(currentStreak(a, addDays(TODAY, 1))).toBe(0);
	});
	it('stops at a gap', () => {
		const a = { [TODAY]: day(), '2026-11-08': day() };
		expect(currentStreak(a, TODAY)).toBe(1);
	});
	it('ignores days with xp but no completed task', () => {
		expect(currentStreak({ [TODAY]: { easy: 0, medium: 0, hard: 0, xp: 12 } }, TODAY)).toBe(0);
	});
});

describe('bestStreak', () => {
	it('finds the longest run', () => {
		const a = {
			'2026-10-01': day(),
			'2026-10-02': day(),
			'2026-10-05': day(),
			'2026-10-06': day(),
			'2026-10-07': day()
		};
		expect(bestStreak(a)).toBe(3);
	});
	it('is 0 when empty', () => {
		expect(bestStreak({})).toBe(0);
	});
});

describe('totalsFor / lastDays', () => {
	const a: Activity = {
		[TODAY]: { easy: 1, medium: 1, hard: 0, xp: 35 },
		'2026-11-04': day(2, 20),
		'2026-10-01': day(5, 50)
	};
	it('sums a window that includes today', () => {
		expect(totalsFor(a, TODAY, 7)).toEqual({ easy: 3, medium: 1, hard: 0, tasks: 4, xp: 55 });
		expect(totalsFor(a, TODAY, 6).tasks).toBe(2);
		expect(totalsFor(a, TODAY, 30).tasks).toBe(4);
	});
	it('lists every day oldest first, with zeros for empty days', () => {
		const bars = lastDays(a, TODAY, 7);
		expect(bars).toHaveLength(7);
		expect(bars[0]).toEqual({ day: '2026-11-04', tasks: 2, xp: 20 });
		expect(bars[6]).toEqual({ day: TODAY, tasks: 2, xp: 35 });
		expect(bars[3].tasks).toBe(0);
	});
});
