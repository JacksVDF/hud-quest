<script lang="ts">
	import { scale } from 'svelte/transition';
	import { ms } from '#lib/motion.ts';
	import { MAX_TAGS, MAX_TAG_LENGTH, addTag } from '#lib/tasks.ts';

	let { tags = $bindable() }: { tags: string[] } = $props();

	const uid = $props.id();
	let draft = $state('');
	const full = $derived(tags.length >= MAX_TAGS);

	function commit() {
		tags = addTag(tags, draft);
		draft = '';
	}

	/** A comma (typed or pasted) ends the current tag. */
	function oninput() {
		if (!draft.includes(',')) return;
		const parts = draft.split(',');
		const rest = parts.pop() ?? '';
		for (const part of parts) tags = addTag(tags, part);
		draft = rest;
	}

	function onkeydown(e: KeyboardEvent) {
		// With an empty field, Enter keeps its normal meaning (submit the form).
		if (e.key === 'Enter' && draft.trim()) {
			e.preventDefault();
			commit();
		}
	}

	function onblur() {
		if (draft.trim()) commit();
	}
</script>

<div class="text-xs">
	<label for="tag-input-{uid}">TAGS_</label>
	<input
		id="tag-input-{uid}"
		class="inp sm mt-1"
		bind:value={draft}
		{oninput}
		{onkeydown}
		{onblur}
		maxlength={MAX_TAG_LENGTH}
		disabled={full}
		placeholder={full ? `max ${MAX_TAGS} tags` : 'type a tag + Enter'}
		autocomplete="off"
	/>
	<ul class="mt-2 flex flex-wrap gap-2 empty:hidden">
		{#each tags as tag (tag)}
			<li
				class="tag s inline-flex items-center gap-1 py-0 pr-0"
				transition:scale={{ duration: ms(160), start: 0.6 }}
			>
				#{tag}
				<button
					type="button"
					class="min-h-10 min-w-10 cursor-pointer font-bold"
					aria-label="Remove tag {tag}"
					onclick={() => (tags = tags.filter((t) => t !== tag))}
				>
					X
				</button>
			</li>
		{/each}
	</ul>
</div>
