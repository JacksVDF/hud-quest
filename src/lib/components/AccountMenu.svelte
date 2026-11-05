<script lang="ts">
	import { resolve } from '$app/paths';
	import { session } from '#lib/session.svelte.ts';

	let { onsignout }: { onsignout: () => void } = $props();
</script>

<!-- Hidden until the session is known, so signed-in users never see a flash of LOGIN. -->
{#if session.ready}
	{#if session.email}
		<div class="flex items-center gap-3">
			<a
				class="max-w-40 truncate text-xs underline sm:max-w-64"
				href={resolve('/account')}
				title="Account settings"
				data-testid="account-email"
			>
				{session.email}
			</a>
			<button type="button" class="btn o sm" onclick={onsignout}>LOGOUT</button>
		</div>
	{:else}
		<a class="btn o sm" href={resolve('/login')}>LOGIN</a>
	{/if}
{/if}
