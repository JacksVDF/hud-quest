import { describe, expect, it } from 'vitest';
import { XP_BY_COMPLEXITY, levelFromXp, rankForLevel, xpForNextLevel } from './xp';

describe('xp', () => {
	it('awards 10/25/50 XP by complexity', () => {
		expect(XP_BY_COMPLEXITY).toEqual({ easy: 10, medium: 25, hard: 50 });
	});

	it('needs level * 100 XP to advance', () => {
		expect(xpForNextLevel(1)).toBe(100);
		expect(xpForNextLevel(3)).toBe(300);
	});

	it('starts at level 1 with 0 XP', () => {
		expect(levelFromXp(0)).toEqual({ level: 1, xpInLevel: 0, xpNeeded: 100 });
	});

	it('levels up exactly at the threshold', () => {
		expect(levelFromXp(99).level).toBe(1);
		expect(levelFromXp(100)).toEqual({ level: 2, xpInLevel: 0, xpNeeded: 200 });
	});

	it('carries leftover XP across levels', () => {
		// 100 (L1) + 200 (L2) = 300 -> level 3, plus 50 leftover
		expect(levelFromXp(350)).toEqual({ level: 3, xpInLevel: 50, xpNeeded: 300 });
	});

	it('clamps negative XP to 0', () => {
		expect(levelFromXp(-20).level).toBe(1);
	});

	it('assigns a new rank every 10 levels', () => {
		expect(rankForLevel(1)).toBe('EMBER');
		expect(rankForLevel(9)).toBe('EMBER');
		expect(rankForLevel(10)).toBe('VESTIGE');
		expect(rankForLevel(19)).toBe('VESTIGE');
		expect(rankForLevel(20)).toBe('LIMINAL');
		expect(rankForLevel(30)).toBe('ZENITH');
		expect(rankForLevel(40)).toBe('ECLIPSE');
		expect(rankForLevel(50)).toBe('PARAGON');
		expect(rankForLevel(60)).toBe('ETERNAL');
	});

	it('keeps the last rank beyond level 60', () => {
		expect(rankForLevel(99)).toBe('ETERNAL');
		expect(rankForLevel(500)).toBe('ETERNAL');
	});
});
