<script lang="ts">
	import { resolve } from '$app/paths';
	import AuthForm from '#lib/components/AuthForm.svelte';
	import AppHeader from '#lib/components/AppHeader.svelte';
</script>

<svelte:head>
	<title>SIGN UP — HUD//QUEST</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
	<AppHeader />

	<main class="mt-8 flex flex-col gap-8">
		<h1 class="h text-4xl sm:text-5xl">_SIGNUP;</h1>
		<AuthForm mode="signup" />
		<a class="text-sm underline" href={resolve('/')}>&lt; Continue as guest</a>
	</main>
</div>
