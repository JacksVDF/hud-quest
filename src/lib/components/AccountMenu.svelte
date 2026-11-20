<script lang="ts">
	import { resolve } from '$app/paths';
	import { session } from '#lib/session.svelte.ts';

	let { onsignout }: { onsignout: () => void } = $props();

	/** The part before the @, shown as the user name so a long address is never cut with "…". */
	const username = $derived(session.email?.split('@')[0] || session.email);
</script>

<!-- Hidden until the session is known, so signed-in users never see a flash of LOGIN. -->
{#if session.ready}
	{#if session.email}
		<div class="flex min-w-0 items-center gap-3">
			<a
				class="wrap text-xs underline"
				href={resolve('/account')}
				title={`Account settings · ${session.email}`}
				data-testid="account-email"
			>
				{username}
			</a>
			<button type="button" class="btn o sm" onclick={onsignout}>LOGOUT</button>
		</div>
	{:else if session.blocked}
		<span class="text-xs" data-testid="offline-badge">OFFLINE</span>
	{:else}
		<a class="btn o sm" href={resolve('/login')}>LOGIN</a>
	{/if}
{/if}
