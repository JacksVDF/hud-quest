<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import AppHeader from '#lib/components/AppHeader.svelte';

	const status = $derived(page.status);
	const notFound = $derived(status === 404);

	// The raw message of a server error can say more than a visitor should see.
	const title = $derived(notFound ? 'SECTOR NOT FOUND' : 'SYSTEM FAULT');
	const text = $derived(
		notFound
			? 'The route you are looking for does not exist or was moved. Head back to base and pick another mission.'
			: 'Something broke on our side. Your tasks are safe. Try again in a moment.'
	);
</script>

<svelte:head>
	<title>{status} — HUD//QUEST</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
	<AppHeader />

	<main class="mt-16 flex flex-col gap-6" data-testid="error-page">
		<div class="text-xs">_ERROR;</div>
		<h1
			class="h flex items-center gap-3 text-7xl leading-none sm:text-9xl"
			aria-label={`Error ${status}`}
		>
			{#if notFound}
				<span aria-hidden="true">4</span>
				<span
					aria-hidden="true"
					class="inline-block h-[0.8em] w-[0.8em] rounded-full border-[0.08em] border-dashed border-f"
				></span>
				<span aria-hidden="true">4</span>
			{:else}
				<span aria-hidden="true">{status}</span>
			{/if}
		</h1>
		<h2 class="h text-3xl sm:text-4xl" data-testid="error-title">{title}</h2>
		<p class="max-w-xl text-sm leading-relaxed">{text}</p>
		<div class="flex flex-wrap gap-3">
			<a class="btn g" href={resolve('/')}>BACK TO BASE</a>
			{#if !notFound}
				<button type="button" class="btn o" onclick={() => location.reload()}>TRY AGAIN</button>
			{/if}
		</div>
	</main>

	<footer class="mt-16 border-t-2 border-f pt-4 text-xs">HANDLE_WITH_CARE;</footer>
</div>
