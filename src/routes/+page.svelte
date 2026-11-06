<script lang="ts">
	import { onMount, tick } from 'svelte';
	import AccountMenu from '#lib/components/AccountMenu.svelte';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import Banner from '#lib/components/Banner.svelte';
	import FilterBar from '#lib/components/FilterBar.svelte';
	import LevelCard from '#lib/components/LevelCard.svelte';
	import Pagination from '#lib/components/Pagination.svelte';
	import TaskForm from '#lib/components/TaskForm.svelte';
	import TaskItem from '#lib/components/TaskItem.svelte';
	import Trash from '#lib/components/Trash.svelte';
	import { ms } from '#lib/motion.ts';
	import { session } from '#lib/session.svelte.ts';
	import {
		clearGuestTasks,
		createLocalStorage,
		createRemoteStorage,
		readGuestTasks
	} from '#lib/storage.ts';
	import { clampPage, pageCount, paginate } from '#lib/pagination.ts';
	import { taskStore, type Change } from '#lib/task-store.svelte.ts';
	import { allTags, filterTasks, type StatusFilter, type Task } from '#lib/tasks.ts';

	let message = $state('');
	// Changes with every message, so the same text twice in a row restarts the countdown.
	let bannerKey = $state(0);

	function say(text: string) {
		message = text;
		bannerKey++;
	}
	// Filters live only in memory, so they reset on reload.
	let selectedTags = $state<string[]>([]);
	let status = $state<StatusFilter>('all');
	let requestedPage = $state(1);

	// Who is signed in decides where the tasks live, so the session is resolved first.
	onMount(async () => {
		await session.refresh();
		await taskStore.useStorage(session.email ? createRemoteStorage() : createLocalStorage());
		guestTasks = session.email ? readGuestTasks() : [];
	});

	// Tasks made as a guest in this browser, offered to the account once after logging in.
	let guestTasks = $state<Task[]>([]);
	let importFailed = $state(false);

	async function importGuestTasks() {
		importFailed = false;
		try {
			const added = await taskStore.importTasks(guestTasks);
			clearGuestTasks();
			guestTasks = [];
			say(`[✓] Imported ${added} task${added === 1 ? '' : 's'} into your account.`);
		} catch {
			importFailed = true;
		}
	}

	async function signOut() {
		guestTasks = [];
		await session.signOut();
		await taskStore.useStorage(createLocalStorage());
	}

	/** Turns an XP change into a feedback message; clears it when nothing changed. */
	function announce(change: Change | null, up: string, down: string) {
		if (!change || change.delta === 0) {
			message = '';
		} else if (change.delta > 0) {
			say(
				change.levelAfter > change.levelBefore
					? `[✓] LEVEL UP! You reached level ${change.levelAfter}. +${change.delta} XP.`
					: `[✓] ${up}: +${change.delta} XP.`
			);
		} else {
			say(`[!] ${down}: ${change.delta} XP.`);
		}
	}

	function toggle(id: string) {
		const result = taskStore.toggle(id);
		if (result) announce(result, 'Task completed', 'Task reopened');
	}

	function labelsFor(taskId: string) {
		const hard = taskStore.tasks.find((t) => t.id === taskId)?.complexity === 'hard';
		return hard
			? { up: 'Milestone completed', down: 'Milestone reopened' }
			: { up: 'Task completed', down: 'Task reopened' };
	}

	const doneCount = $derived(taskStore.tasks.filter((t) => t.done).length);
	const tagOptions = $derived(allTags(taskStore.tasks));
	// Ignore selected tags that no task has anymore (e.g. after editing or deleting).
	const activeTags = $derived(selectedTags.filter((t) => tagOptions.includes(t)));
	const visible = $derived(filterTasks(taskStore.tasks, { tags: activeTags, status }));
	// Clamped, so deleting the last task of the last page falls back to the previous page.
	const page = $derived(clampPage(requestedPage, visible.length));
	const pageTasks = $derived(paginate(visible, page));

	let listEl = $state<HTMLElement>();

	/** Changes page and brings the first task of that page into view (below the sticky header). */
	async function goToPage(p: number) {
		requestedPage = p;
		await tick();
		listEl?.scrollIntoView({ block: 'start', behavior: ms(1) === 0 ? 'auto' : 'smooth' });
	}

	// A new filter always starts on page 1.
	$effect(() => {
		void [activeTags.join(), status];
		requestedPage = 1;
	});
</script>

<svelte:head>
	<title>HUD//QUEST — To-Do</title>
	<meta
		name="description"
		content="A gamified to-do list: complete tasks to earn XP, level up and climb the ranks."
	/>
	<meta property="og:type" content="website" />
	<meta property="og:title" content="HUD//QUEST — To-Do" />
	<meta
		property="og:description"
		content="A gamified to-do list: complete tasks to earn XP, level up and climb the ranks."
	/>
	<meta name="twitter:card" content="summary" />
</svelte:head>

<div class="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
	<AppHeader>
		{#snippet account()}
			<AccountMenu onsignout={signOut} />
		{/snippet}
	</AppHeader>

	<main class="mt-8 flex flex-col gap-8">
		<h1 class="h text-4xl sm:text-5xl">_TASKS;</h1>

		<LevelCard info={taskStore.levelInfo} totalXp={taskStore.xp} />

		<TaskForm
			disabled={!taskStore.loaded}
			onadd={(title, c, tags) => taskStore.add(title, c, tags)}
		/>

		<!-- Fixed height (two lines on mobile), so a message never pushes the page down or up.
		     Old and new banners share one grid cell so a replaced message cross-fades in place. -->
		<div aria-live="polite" class="grid h-[4.5rem] grid-rows-[minmax(0,1fr)] sm:h-16">
			{#key bannerKey}
				{#if message}
					<Banner {message} onclose={() => (message = '')} />
				{/if}
			{/key}
		</div>

		{#if taskStore.loaded && guestTasks.length > 0}
			<div class="flex flex-col gap-3 border-2 border-f p-3 text-sm" data-testid="import-prompt">
				<p>
					&gt; Found {guestTasks.length} task{guestTasks.length === 1 ? '' : 's'} saved in this browser
					as a guest. Add {guestTasks.length === 1 ? 'it' : 'them'} to your account?
				</p>
				{#if importFailed}
					<p role="alert">[!] Could not import. Try again.</p>
				{/if}
				<div class="flex flex-wrap gap-3">
					<button type="button" class="btn g sm" onclick={importGuestTasks}>IMPORT &gt;</button>
					<button type="button" class="btn o sm" onclick={() => (guestTasks = [])}>
						NOT NOW
					</button>
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

		<section aria-labelledby="list-title" class="flex flex-col gap-4">
			<h2 id="list-title" class="h text-2xl">
				_MISSIONS; <span class="text-sm font-normal">{doneCount}/{taskStore.tasks.length}</span>
			</h2>

			{#if taskStore.problem === 'load'}
				<p class="border-2 border-f p-3 text-sm" role="alert">
					[!] Could not load your tasks. Reload the page to try again.
				</p>
			{:else if !taskStore.loaded}
				<p class="text-sm">&gt; loading…</p>
			{:else if taskStore.tasks.length === 0}
				<p class="text-sm">&gt; No tasks yet. Add one above to start earning XP.</p>
			{:else}
				<FilterBar tags={tagOptions} bind:selected={selectedTags} bind:status />

				{#if visible.length === 0}
					<p class="text-sm">&gt; No tasks match the current filters.</p>
				{:else}
					<ul class="flex scroll-mt-28 flex-col gap-4" bind:this={listEl}>
						{#each pageTasks as task (task.id)}
							<TaskItem
								{task}
								ontoggle={toggle}
								onsave={(id, patch) => taskStore.update(id, patch)}
								onremove={(id) =>
									announce(taskStore.remove(id), 'Task moved to trash', 'Task moved to trash')}
								onadditem={(id, title) =>
									announce(taskStore.addItem(id, title), 'XP updated', 'XP updated')}
								ontoggleitem={(id, itemId) => {
									const l = labelsFor(id);
									announce(taskStore.toggleItem(id, itemId), l.up, l.down);
								}}
								onremoveitem={(id, itemId) =>
									announce(taskStore.removeItem(id, itemId), 'XP updated', 'XP updated')}
							/>
						{/each}
					</ul>
					<Pagination bind:page={() => page, goToPage} count={pageCount(visible.length)} />
				{/if}
			{/if}
		</section>

		<Trash
			tasks={taskStore.trash}
			onrestore={(id) => announce(taskStore.restore(id), 'Task restored', 'Task restored')}
			onpurge={(id) => taskStore.purge(id)}
			onempty={() => taskStore.emptyTrash()}
		/>
	</main>

	<footer class="mt-16 border-t-2 border-f pt-4 text-xs">HANDLE_WITH_CARE;</footer>
</div>
