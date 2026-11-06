<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import ThemeToggle from './ThemeToggle.svelte';

	let { account }: { account?: Snippet } = $props();
</script>

<!-- Sticky: the logo, account and theme controls stay reachable while the page scrolls. -->
<div class="sticky top-0 z-30 bg-b" data-testid="app-header">
	<header class="flex items-center justify-between gap-3 py-3 sm:py-4">
		<a href={resolve('/')} class="h text-base tracking-widest whitespace-nowrap sm:text-xl"
			>X HUD//QUEST</a
		>
		<div class="flex items-center gap-2 sm:gap-3">
			{@render account?.()}
			<ThemeToggle />
		</div>
	</header>
	<div class="gl h-1 grow" aria-hidden="true"></div>
</div>
