<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import UpdateBanner from '#lib/components/UpdateBanner.svelte';
	import { app } from '#lib/app.svelte.ts';
	import { setNavigating } from '#lib/motion.ts';
	import { SITE_URL } from '#lib/site.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	beforeNavigate(() => setNavigating(true));
	afterNavigate(() => setNavigating(false));

	// Back online: find out who is signed in again and load their tasks.
	onMount(() => {
		const back = () => app.reconnect();
		window.addEventListener('online', back);
		return () => window.removeEventListener('online', back);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} type="image/svg+xml" />
	<link rel="icon" href="/icon-32.png" type="image/png" sizes="32x32" />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#000000" />
	<meta property="og:site_name" content="HUD//QUEST" />
	<meta property="og:image" content={`${SITE_URL}/og-image.png`} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="HUD//QUEST: complete tasks, earn XP, level up." />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

{@render children()}
<UpdateBanner />
