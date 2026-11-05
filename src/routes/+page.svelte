<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import AccountMenu from '#lib/components/AccountMenu.svelte';
	import FilterBar from '#lib/components/FilterBar.svelte';
	import LevelCard from '#lib/components/LevelCard.svelte';
	import Pagination from '#lib/components/Pagination.svelte';
	import TaskForm from '#lib/components/TaskForm.svelte';
	import TaskItem from '#lib/components/TaskItem.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import { ms } from '#lib/motion.ts';
	import { clampPage, pageCount, paginate } from '#lib/pagination.ts';
	import { taskStore, type Change } from '#lib/task-store.svelte.ts';
	import { allTags, filterTasks, type StatusFilter } from '#lib/tasks.ts';

	let message = $state('');
	// Filters live only in memory, so they reset on reload.
	let selectedTags = $state<string[]>([]);
	let status = $state<StatusFilter>('all');
	let requestedPage = $state(1);

	onMount(() => taskStore.load());

	/** Turns an XP change into a feedback message; clears it when nothing changed. */
	function announce(change: Change | null, up: string, down: string) {
		if (!change || change.delta === 0) {
			message = '';
		} else if (change.delta > 0) {
			message =
				change.levelAfter > change.levelBefore
					? `[✓] LEVEL UP! You reached level ${change.levelAfter}. +${change.delta} XP.`
					: `[✓] ${up}: +${change.delta} XP.`;
		} else {
			message = `[!] ${down}: ${change.delta} XP.`;
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
	<header class="flex items-center justify-between gap-4 py-5">
		<div class="h text-lg tracking-widest sm:text-xl">X HUD//QUEST</div>
		<div class="flex items-center gap-3">
			<AccountMenu />
			<ThemeToggle />
		</div>
	</header>
	<div class="gl h-1 grow" aria-hidden="true"></div>

	<main class="mt-8 flex flex-col gap-8">
		<h1 class="h text-4xl sm:text-5xl">_TASKS;</h1>

		<LevelCard info={taskStore.levelInfo} totalXp={taskStore.xp} />

		<TaskForm onadd={(title, c, tags) => taskStore.add(title, c, tags)} />

		<!-- Old and new banners share one grid cell so a replaced message cross-fades in place. -->
		<div aria-live="polite" class="grid min-h-12">
			{#key message}
				{#if message}
					<p
						in:fly|global={{ y: -10, duration: ms(220) }}
						out:fade|global={{ duration: ms(150) }}
						class="col-start-1 row-start-1 flex items-center justify-between gap-3 p-3 text-sm {message.startsWith(
							'[✓]'
						)
							? 'bg-f text-b'
							: 'border-2 border-f'} {message.includes('LEVEL UP') ? 'gline pb-4' : ''}"
					>
						<span>{message}</span>
						<button
							type="button"
							class="font-bold"
							onclick={() => (message = '')}
							aria-label="Dismiss"
						>
							[X]
						</button>
					</p>
				{/if}
			{/key}
		</div>

		<section aria-labelledby="list-title" class="flex flex-col gap-4">
			<h2 id="list-title" class="h text-2xl">
				_MISSIONS; <span class="text-sm font-normal">{doneCount}/{taskStore.tasks.length}</span>
			</h2>

			{#if !taskStore.loaded}
				<p class="text-sm">&gt; loading…</p>
			{:else if taskStore.tasks.length === 0}
				<p class="text-sm">&gt; No tasks yet. Add one above to start earning XP.</p>
			{:else}
				<FilterBar tags={tagOptions} bind:selected={selectedTags} bind:status />

				{#if visible.length === 0}
					<p class="text-sm">&gt; No tasks match the current filters.</p>
				{:else}
					<ul class="flex flex-col gap-4">
						{#each pageTasks as task (task.id)}
							<TaskItem
								{task}
								ontoggle={toggle}
								onsave={(id, patch) => taskStore.update(id, patch)}
								onremove={(id) => announce(taskStore.remove(id), 'Task deleted', 'Task deleted')}
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
					<Pagination
						bind:page={() => page, (p) => (requestedPage = p)}
						count={pageCount(visible.length)}
					/>
				{/if}
			{/if}
		</section>
	</main>

	<footer class="mt-16 border-t-2 border-f pt-4 text-xs">HANDLE_WITH_CARE;</footer>
</div>
