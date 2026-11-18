<script lang="ts">
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { resolve } from '$app/paths';
	import ProgressBar from './ProgressBar.svelte';
	import { ms } from '#lib/motion.ts';
	import { rankForLevel, type LevelInfo } from '#lib/xp.ts';

	let {
		info,
		totalXp,
		streak
	}: {
		info: LevelInfo;
		totalXp: number;
		/** Days in a row with a completed task. Leave out to hide the counter. */
		streak?: number;
	} = $props();

	// Total XP counts up/down to its new value instead of jumping.
	const shownXp = Tween.of(() => totalXp, { duration: ms(450), easing: cubicOut });
	const rank = $derived(rankForLevel(info.level));
</script>

<section class="brk p-5" aria-label="Level progress">
	<div class="flex items-end justify-between gap-4">
		<div>
			<div class="text-xs">LEVEL</div>
			{#key info.level}
				<div class="h pop text-5xl leading-none">{info.level}</div>
			{/key}
		</div>
		<div class="text-right text-xs">
			{#key rank}
				<div class="pop" style:transform-origin="right center">{rank}</div>
			{/key}
			<div>XP {info.xpInLevel}/{info.xpNeeded}</div>
			<div>TOTAL {Math.round(shownXp.current)}</div>
			{#if streak !== undefined}
				<a
					class="mt-1 inline-block underline"
					href={resolve('/stats')}
					data-testid="streak"
					aria-label={`Streak: ${streak} ${streak === 1 ? 'day' : 'days'}. Open statistics`}
				>
					STREAK {streak}D &gt;
				</a>
			{/if}
		</div>
	</div>
	<div class="mt-4">
		<ProgressBar value={info.xpInLevel} max={info.xpNeeded} label="XP to next level" />
	</div>
</section>
