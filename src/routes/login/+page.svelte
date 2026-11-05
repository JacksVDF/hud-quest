<script lang="ts">
	import { resolve } from '$app/paths';
	import AuthForm from '#lib/components/AuthForm.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
</script>

<svelte:head>
	<title>LOGIN — HUD//QUEST</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
	<header class="flex items-center justify-between gap-4 py-5">
		<a href={resolve('/')} class="h text-lg tracking-widest sm:text-xl">X HUD//QUEST</a>
		<ThemeToggle />
	</header>
	<div class="gl h-1 grow" aria-hidden="true"></div>

	<main class="mt-8 flex flex-col gap-8">
		<h1 class="h text-4xl sm:text-5xl">_LOGIN;</h1>
		<AuthForm mode="login" />
		<a class="text-sm underline" href={resolve('/')}>&lt; Continue as guest</a>
	</main>
</div>
