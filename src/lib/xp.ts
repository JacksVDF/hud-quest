export type Complexity = 'easy' | 'medium' | 'hard';

export const XP_BY_COMPLEXITY: Record<Complexity, number> = {
	easy: 10,
	medium: 25,
	hard: 50
};

export const COMPLEXITIES = Object.keys(XP_BY_COMPLEXITY) as Complexity[];

/** XP needed to go from `level` to `level + 1`. */
export function xpForNextLevel(level: number): number {
	return level * 100;
}

export interface LevelInfo {
	level: number;
	/** XP accumulated inside the current level. */
	xpInLevel: number;
	/** XP required to finish the current level. */
	xpNeeded: number;
}

export function levelFromXp(totalXp: number): LevelInfo {
	let level = 1;
	let remaining = Math.max(0, totalXp);
	while (remaining >= xpForNextLevel(level)) {
		remaining -= xpForNextLevel(level);
		level++;
	}
	return { level, xpInLevel: remaining, xpNeeded: xpForNextLevel(level) };
}

/** One rank per 10 levels; the last rank applies from level 60 onward. */
export const RANKS = [
	'EMBER',
	'VESTIGE',
	'LIMINAL',
	'ZENITH',
	'ECLIPSE',
	'PARAGON',
	'ETERNAL'
] as const;
export type Rank = (typeof RANKS)[number];

export function rankForLevel(level: number): Rank {
	const tier = Math.floor(Math.max(1, level) / 10);
	return RANKS[Math.min(tier, RANKS.length - 1)];
}
