<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authClient } from '#lib/auth-client.ts';
	import { session } from '#lib/session.svelte.ts';

	// Mirrors the server rules in src/lib/server/auth.ts.
	const MIN_PASSWORD_LENGTH = 10;

	let { mode }: { mode: 'login' | 'signup' } = $props();

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);
	// Until the page is interactive a submit would be a plain browser form post.
	let ready = $state(false);
	onMount(() => (ready = true));

	const isSignup = $derived(mode === 'signup');

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		error = '';
		busy = true;
		try {
			const { error: failure } = isSignup
				? await authClient.signUp.email({ email, password, name: email.split('@')[0] })
				: await authClient.signIn.email({ email, password });
			if (failure) {
				error = messageFor(failure.status, failure.message);
				return;
			}
			await session.refresh();
			await goto(resolve('/'));
		} catch {
			error = 'Could not reach the server. Try again.';
		} finally {
			busy = false;
		}
	}

	function messageFor(status: number, fallback?: string) {
		if (status === 429) return 'Too many attempts. Wait a minute and try again.';
		if (status === 401) return 'Wrong email or password.';
		if (status === 422) return 'That email is already registered.';
		return fallback || 'Something went wrong. Try again.';
	}
</script>

<!-- method="post" so credentials can never end up in the URL if the script fails to load. -->
<form class="flex max-w-md flex-col gap-4" method="post" onsubmit={submit}>
	<label class="text-xs">
		EMAIL_
		<input
			class="inp mt-1"
			type="email"
			name="email"
			autocomplete="email"
			maxlength="254"
			required
			bind:value={email}
		/>
	</label>
	<label class="text-xs">
		PASSWORD_
		<input
			class="inp mt-1"
			type="password"
			name="password"
			autocomplete={isSignup ? 'new-password' : 'current-password'}
			minlength={isSignup ? MIN_PASSWORD_LENGTH : undefined}
			maxlength="128"
			required
			bind:value={password}
		/>
	</label>
	{#if isSignup}
		<p class="text-xs">&gt; At least {MIN_PASSWORD_LENGTH} characters.</p>
	{/if}

	<div aria-live="polite">
		{#if error}
			<p class="border-2 border-f p-3 text-sm" role="alert">[!] {error}</p>
		{/if}
	</div>

	<div class="flex flex-wrap items-center gap-4">
		<button type="submit" class="btn g" disabled={busy || !ready}>
			{busy ? 'WAIT…' : isSignup ? 'CREATE ACCOUNT >' : 'LOGIN >'}
		</button>
		{#if isSignup}
			<a class="text-sm underline" href={resolve('/login')}>I already have an account</a>
		{:else}
			<a class="text-sm underline" href={resolve('/signup')}>Create an account</a>
		{/if}
	</div>
</form>
