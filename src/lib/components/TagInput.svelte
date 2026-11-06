<script lang="ts">
	import { scale } from 'svelte/transition';
	import { ms } from '#lib/motion.ts';
	import { MAX_TAGS, MAX_TAG_LENGTH, addTag, normalizeTag } from '#lib/tasks.ts';

	let {
		tags = $bindable(),
		compact = true
	}: {
		tags: string[];
		/** 36px input for the edit form; false gives the 44px input of the new-task form. */
		compact?: boolean;
	} = $props();

	const uid = $props.id();
	let draft = $state('');
	const full = $derived(tags.length >= MAX_TAGS);

	/** Shown when a tag was not added because it is already in the list. */
	let notice = $state('');

	/** Adds one tag; explains why when it is a duplicate. */
	function add(raw: string) {
		const tag = normalizeTag(raw);
		if (tag && tags.includes(tag)) notice = `#${tag} is already added.`;
		tags = addTag(tags, raw);
	}

	function commit() {
		add(draft);
		draft = '';
	}

	/** A comma (typed or pasted) ends the current tag. */
	function oninput() {
		// Typing again means the user has seen the message.
		notice = '';
		if (!draft.includes(',')) return;
		const parts = draft.split(',');
		const rest = parts.pop() ?? '';
		for (const part of parts) add(part);
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
		class="inp mt-1"
		class:sm={compact}
		bind:value={draft}
		{oninput}
		{onkeydown}
		{onblur}
		maxlength={MAX_TAG_LENGTH}
		disabled={full}
		placeholder={full ? `max ${MAX_TAGS} tags` : 'type a tag + Enter'}
		autocomplete="off"
	/>
	<p class="mt-2 min-h-5" role="status">
		{#if notice}[!] {notice}{/if}
	</p>
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
					onclick={() => {
						tags = tags.filter((t) => t !== tag);
						notice = '';
					}}
				>
					X
				</button>
			</li>
		{/each}
	</ul>
</div>
