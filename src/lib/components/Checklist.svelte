<script lang="ts">
	import { slide } from 'svelte/transition';
	import { MOTION, dismiss, ms } from '#lib/motion.ts';
	import type { Item } from '#lib/tasks.ts';

	let {
		items,
		noun,
		onadd,
		ontoggle,
		onremove
	}: {
		items: Item[];
		/** Singular name shown in placeholders and labels, e.g. "subtask". */
		noun: string;
		onadd: (title: string) => void;
		ontoggle: (itemId: string) => void;
		onremove: (itemId: string) => void;
	} = $props();

	let draft = $state('');

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!draft.trim()) return;
		onadd(draft);
		draft = '';
	}
</script>

<ul class="flex flex-col gap-2 empty:hidden">
	{#each items as item (item.id)}
		<li
			class="flex items-center gap-2"
			in:slide={{ duration: ms(MOTION.enter) }}
			out:dismiss|global={{ duration: ms(MOTION.exit), x: MOTION.travel }}
		>
			<button
				type="button"
				role="checkbox"
				aria-checked={item.done}
				aria-label={item.done
					? `Mark ${noun} "${item.title}" as not done`
					: `Mark ${noun} "${item.title}" as done`}
				class="chk h-9 w-12 shrink-0 border-2 border-f text-xs font-bold"
				onclick={() => ontoggle(item.id)}
			>
				{item.done ? '[X]' : '[ ]'}
			</button>
			<span
				class="min-w-0 flex-1 text-sm break-words transition-opacity duration-200"
				class:line-through={item.done}
				class:opacity-75={item.done}
			>
				{item.title}
			</span>
			<button
				type="button"
				class="btn o sm"
				aria-label={`Delete ${noun} "${item.title}"`}
				onclick={() => onremove(item.id)}
			>
				DEL
			</button>
		</li>
	{/each}
</ul>

<form class="flex gap-2" onsubmit={submit}>
	<input
		class="inp sm min-w-0 flex-1"
		bind:value={draft}
		maxlength="120"
		placeholder="new {noun}"
		aria-label="New {noun}"
	/>
	<button type="submit" class="btn sm" disabled={!draft.trim()}>ADD</button>
</form>
