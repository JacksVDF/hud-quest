<script lang="ts">
	import { formatDay } from '#lib/dates.ts';
	import type { DayBar } from '#lib/activity.ts';

	/** Tasks completed per day as plain bars. The numbers are also readable as text. */
	let { bars, today }: { bars: DayBar[]; today: string } = $props();

	const max = $derived(Math.max(1, ...bars.map((b) => b.tasks)));
</script>

<ul class="flex h-40 items-end gap-1 border-b-2 border-f" aria-label="Tasks completed per day">
	{#each bars as bar (bar.day)}
		<li
			class="flex h-full min-w-0 flex-1 flex-col justify-end"
			title={`${formatDay(bar.day, today)}: ${bar.tasks} tasks, ${bar.xp} XP`}
			data-testid="bar"
			data-tasks={bar.tasks}
		>
			<span class="sr-only">
				{formatDay(bar.day, today)}: {bar.tasks}
				{bar.tasks === 1 ? 'task' : 'tasks'}, {bar.xp} XP
			</span>
			<span
				aria-hidden="true"
				class="block w-full {bar.day === today ? 'gl' : 'bg-f'}"
				style:height={bar.tasks === 0 ? '2px' : `${(bar.tasks / max) * 100}%`}
				style:opacity={bar.tasks === 0 ? 0.35 : 1}
			></span>
		</li>
	{/each}
</ul>
<div class="mt-1 flex justify-between text-xs" aria-hidden="true">
	<span>{formatDay(bars[0].day, today)}</span>
	<span>TODAY</span>
</div>
