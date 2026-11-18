<script lang="ts">
	import { onMount } from 'svelte';

	/** A new version of the app is installed and waiting for the player to accept it. */
	let waiting = $state<ServiceWorker | null>(null);
	let accepted = false;

	function accept() {
		accepted = true;
		waiting?.postMessage('SKIP_WAITING');
	}

	onMount(() => {
		if (!('serviceWorker' in navigator)) return;
		const sw = navigator.serviceWorker;
		// The first install also takes control of the page; only a version the player accepted reloads.
		let reloading = false;

		// A worker that finished installing while another one is in charge is the new version.
		const watch = (registration: ServiceWorkerRegistration) => {
			if (registration.waiting && sw.controller) waiting = registration.waiting;
			registration.addEventListener('updatefound', () => {
				const next = registration.installing;
				next?.addEventListener('statechange', () => {
					if (next.state === 'installed' && sw.controller) waiting = next;
				});
			});
		};
		void sw.getRegistration().then((registration) => registration && watch(registration));

		const swap = () => {
			if (reloading || !accepted) return;
			reloading = true;
			location.reload();
		};
		sw.addEventListener('controllerchange', swap);
		return () => sw.removeEventListener('controllerchange', swap);
	});
</script>

{#if waiting}
	<div
		class="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-3 border-t-2 border-f bg-b p-3 text-sm"
		role="status"
		data-testid="update-banner"
	>
		<span>&gt; NEW VERSION READY.</span>
		<button type="button" class="btn g sm" onclick={accept}> RELOAD &gt; </button>
		<button type="button" class="btn o sm" onclick={() => (waiting = null)}>LATER</button>
	</div>
{/if}
