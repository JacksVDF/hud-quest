<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import { setNavigating } from '#lib/motion.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	beforeNavigate(() => setNavigating(true));
	afterNavigate(() => setNavigating(false));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
