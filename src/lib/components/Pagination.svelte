<script lang="ts">
	let {
		page = $bindable(),
		count,
		label = 'Pagination'
	}: { page: number; count: number; label?: string } = $props();

	const pages = $derived(Array.from({ length: count }, (_, i) => i + 1));
</script>

{#if count > 1}
	<nav aria-label={label} class="flex flex-wrap items-center gap-2">
		<button
			type="button"
			class="btn o sm min-h-11 min-w-11 justify-center px-0"
			disabled={page <= 1}
			aria-label="Previous page"
			onclick={() => (page = page - 1)}
		>
			&lt;
		</button>
		{#each pages as p (p)}
			<button
				type="button"
				class="btn sm min-h-11 min-w-11 justify-center px-0 {p === page ? '' : 'o'}"
				aria-label="Page {p}"
				aria-current={p === page ? 'page' : undefined}
				onclick={() => (page = p)}
			>
				{p}
			</button>
		{/each}
		<button
			type="button"
			class="btn o sm min-h-11 min-w-11 justify-center px-0"
			disabled={page >= count}
			aria-label="Next page"
			onclick={() => (page = page + 1)}
		>
			&gt;
		</button>
	</nav>
{/if}
