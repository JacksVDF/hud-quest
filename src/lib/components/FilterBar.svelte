<script lang="ts">
	import type { StatusFilter } from '#lib/tasks.ts';

	let {
		tags,
		selected = $bindable(),
		status = $bindable()
	}: { tags: string[]; selected: string[]; status: StatusFilter } = $props();

	const STATUSES: StatusFilter[] = ['all', 'open', 'done'];
	const name = $props.id();

	function toggleTag(tag: string) {
		selected = selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag];
	}
</script>

<div class="flex flex-col gap-4">
	<fieldset class="m-0 min-w-0 border-0 p-0">
		<legend class="mb-1 p-0 text-xs">STATUS_</legend>
		<div class="grid grid-cols-3 border-2 border-f sm:inline-grid">
			{#each STATUSES as s (s)}
				<label class="relative cursor-pointer border-f not-first:border-l-2">
					<input type="radio" class="peer sr-only" {name} value={s} bind:group={status} />
					<span
						class="flex min-h-9 items-center justify-center px-5 text-xs font-bold peer-checked:bg-f peer-checked:text-b peer-focus-visible:outline-3 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-hud-pink"
					>
						{s.toUpperCase()}
					</span>
				</label>
			{/each}
		</div>
	</fieldset>

	{#if tags.length > 0}
		<div>
			<div class="mb-1 text-xs">TAGS_</div>
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					class="tag inline-flex min-h-10 cursor-pointer items-center"
					class:s={selected.length === 0}
					aria-pressed={selected.length === 0}
					onclick={() => (selected = [])}
				>
					ALL
				</button>
				{#each tags as tag (tag)}
					<button
						type="button"
						class="tag inline-flex min-h-10 cursor-pointer items-center"
						class:s={selected.includes(tag)}
						aria-pressed={selected.includes(tag)}
						onclick={() => toggleTag(tag)}
					>
						#{tag}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
