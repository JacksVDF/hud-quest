<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import { authClient } from '#lib/auth-client.ts';
	import { buildExport, download } from '#lib/export.ts';
	import { session } from '#lib/session.svelte.ts';
	import { parseData } from '#lib/workspaces.ts';

	let password = $state('');
	let error = $state('');
	let busy = $state(false);
	let confirming = $state(false);
	let exporting = $state(false);
	let exportError = $state('');

	onMount(() => void session.refresh());

	/** Downloads what is saved on the server, read fresh so it matches what the account really holds. */
	async function exportData() {
		if (exporting) return;
		exportError = '';
		exporting = true;
		try {
			const res = await fetch('/api/tasks');
			if (!res.ok) throw new Error(String(res.status));
			download(buildExport(parseData(await res.text()), Date.now()));
		} catch {
			exportError = 'Could not download your data. Try again.';
		} finally {
			exporting = false;
		}
	}

	async function deleteAccount(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		error = '';
		busy = true;
		try {
			const { error: failure } = await authClient.deleteUser({ password });
			if (failure) {
				error =
					failure.status === 429
						? 'Too many attempts. Wait a minute and try again.'
						: 'Wrong password.';
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
</script>

<svelte:head>
	<title>ACCOUNT — HUD//QUEST</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
	<AppHeader />

	<main class="mt-8 flex flex-col gap-8">
		<h1 class="h text-4xl sm:text-5xl">_ACCOUNT;</h1>

		{#if !session.ready}
			<p class="text-sm">&gt; loading…</p>
		{:else if !session.email}
			<p class="text-sm">&gt; You are not signed in.</p>
			<a class="btn o sm self-start" href={resolve('/login')}>LOGIN</a>
		{:else}
			<p class="text-sm" data-testid="account-page-email">&gt; Signed in as {session.email}</p>

			<section class="flex max-w-md flex-col gap-4 border-2 border-f p-4">
				<h2 class="h text-2xl">_EXPORT;</h2>
				<p class="text-sm">
					Download your workspaces, tasks (trash included) and daily history as one JSON file.
				</p>
				<div aria-live="polite">
					{#if exportError}
						<p class="border-2 border-f p-3 text-sm" role="alert">[!] {exportError}</p>
					{/if}
				</div>
				<button
					type="button"
					class="btn o self-start"
					disabled={exporting}
					data-testid="export"
					onclick={exportData}
				>
					{exporting ? 'WAIT…' : 'DOWNLOAD MY DATA'}
				</button>
			</section>

			<section class="flex max-w-md flex-col gap-4 border-2 border-f p-4">
				<h2 class="h text-2xl">_DELETE;</h2>
				<p class="text-sm">
					This permanently deletes your account and all your tasks and XP. It cannot be undone.
				</p>
				{#if !confirming}
					<button type="button" class="btn o self-start" onclick={() => (confirming = true)}>
						DELETE ACCOUNT
					</button>
				{:else}
					<form class="flex flex-col gap-4" onsubmit={deleteAccount}>
						<label class="text-xs">
							CONFIRM_PASSWORD_
							<input
								class="inp mt-1"
								type="password"
								name="password"
								autocomplete="current-password"
								maxlength="128"
								required
								bind:value={password}
							/>
						</label>
						<div aria-live="polite">
							{#if error}
								<p class="border-2 border-f p-3 text-sm" role="alert">[!] {error}</p>
							{/if}
						</div>
						<div class="flex flex-wrap gap-3">
							<button type="submit" class="btn g" disabled={busy}>
								{busy ? 'WAIT…' : 'DELETE FOREVER >'}
							</button>
							<button
								type="button"
								class="btn o"
								onclick={() => {
									confirming = false;
									password = '';
									error = '';
								}}
							>
								CANCEL
							</button>
						</div>
					</form>
				{/if}
			</section>
		{/if}

		<a class="text-sm underline" href={resolve('/')}>&lt; Back to tasks</a>
	</main>
</div>
