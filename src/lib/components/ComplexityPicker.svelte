<script lang="ts">
	import { COMPLEXITIES, XP_BY_COMPLEXITY, type Complexity } from '#lib/xp.ts';

	let { value = $bindable() }: { value: Complexity } = $props();

	const name = $props.id();
</script>

<fieldset class="m-0 min-w-0 border-0 p-0">
	<legend class="mb-1 p-0 text-xs">COMPLEXITY_</legend>
	<div class="grid grid-cols-3 border-2 border-f sm:inline-grid">
		{#each COMPLEXITIES as c (c)}
			<label class="relative cursor-pointer border-f not-first:border-l-2">
				<input type="radio" class="peer sr-only" {name} value={c} bind:group={value} />
				<span
					class="flex min-h-10 flex-col items-center justify-center px-4 text-xs font-bold peer-checked:bg-f peer-checked:text-b peer-focus-visible:outline-3 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-hud-pink"
				>
					{c.toUpperCase()}
					<span class="font-normal">+{XP_BY_COMPLEXITY[c]} XP</span>
				</span>
			</label>
		{/each}
	</div>
</fieldset>
