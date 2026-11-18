<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { MOTION, ms } from '#lib/motion.ts';
	import { MAX_WORKSPACES } from '#lib/workspaces.ts';
	import { COMPLEXITIES, RANKS, XP_BY_COMPLEXITY, xpForNextLevel } from '#lib/xp.ts';

	/** Set once the player closes the panel; it never comes back in this browser. */
	const KEY = 'hud-quest-todo:welcome';

	/** Only offered to someone who has nothing yet, so people with data never see it. */
	let { fresh }: { fresh: boolean } = $props();

	let seen = $state(true);
	onMount(() => (seen = localStorage.getItem(KEY) === '1'));

	function close() {
		seen = true;
		localStorage.setItem(KEY, '1');
	}
</script>

{#if fresh && !seen}
	<section
		class="brk flex flex-col gap-4 p-5"
		aria-labelledby="welcome-title"
		data-testid="welcome"
		transition:slide={{ duration: ms(MOTION.enter) }}
	>
		<h2 id="welcome-title" class="h text-2xl">_WELCOME;</h2>
		<ul class="flex flex-col gap-2 text-sm">
			<li>
				&gt; Complete tasks to earn XP:
				{#each COMPLEXITIES as c, i (c)}
					{c.toUpperCase()} +{XP_BY_COMPLEXITY[c]}{i < COMPLEXITIES.length - 1 ? ', ' : '.'}
				{/each}
			</li>
			<li>
				&gt; Level 1 needs {xpForNextLevel(1)} XP, level 2 needs {xpForNextLevel(2)}, and so on.
				Every 10 levels you reach a new rank: {RANKS.slice(0, 3).join(', ')}…
			</li>
			<li>&gt; Medium tasks have subtasks. Hard tasks are projects with milestones.</li>
			<li>
				&gt; Group tasks in up to {MAX_WORKSPACES} workspaces. Add a due date, or make a task repeat.
			</li>
			<li>&gt; Complete at least one task a day to build a streak.</li>
		</ul>
		<button type="button" class="btn g sm self-start" onclick={close} data-testid="welcome-close">
			GOT IT &gt;
		</button>
	</section>
{/if}
