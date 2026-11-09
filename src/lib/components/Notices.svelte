<script lang="ts">
	import Banner from './Banner.svelte';
	import { app, describeCounts } from '#lib/app.svelte.ts';
	import { notice } from '#lib/notice.svelte.ts';
	import { taskStore } from '#lib/task-store.svelte.ts';
</script>

<!-- Fixed height (two lines on mobile), so a message never pushes the page down or up.
     Old and new banners share one grid cell so a replaced message cross-fades in place. -->
<div aria-live="polite" class="grid h-[4.5rem] grid-rows-[minmax(0,1fr)] sm:h-16">
	{#key notice.key}
		{#if notice.message}
			<Banner message={notice.message} onclose={() => notice.clear()} />
		{/if}
	{/key}
</div>

{#if taskStore.loaded && app.guest}
	<div class="flex flex-col gap-3 border-2 border-f p-3 text-sm" data-testid="import-prompt">
		<p>
			&gt; Found {describeCounts(app.guest.tasks.length, app.guest.workspaces.length)} saved in this browser
			as a guest. Add {app.guest.tasks.length + app.guest.workspaces.length === 1 ? 'it' : 'them'} to
			your account?
		</p>
		{#if app.importFailed}
			<p role="alert">[!] Could not import. Try again.</p>
		{/if}
		<div class="flex flex-wrap gap-3">
			<button type="button" class="btn g sm" onclick={() => app.importGuest()}>IMPORT &gt;</button>
			<button type="button" class="btn o sm" onclick={() => app.dismissGuest()}>NOT NOW</button>
		</div>
	</div>
{/if}

{#if taskStore.problem === 'conflict'}
	<div class="flex flex-col gap-3 border-2 border-f p-3 text-sm" role="alert">
		<p>[!] Your tasks were changed in another tab or device. Your last change was not saved.</p>
		<div>
			<button type="button" class="btn g sm" onclick={() => taskStore.load()}>
				RELOAD TASKS &gt;
			</button>
		</div>
	</div>
{:else if taskStore.problem === 'save'}
	<p class="border-2 border-f p-3 text-sm" role="alert">
		[!] Your last change could not be saved. Check your connection and try again.
	</p>
{/if}
