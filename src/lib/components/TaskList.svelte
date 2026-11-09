<script lang="ts">
	import { tick } from 'svelte';
	import { slide } from 'svelte/transition';
	import FilterBar from './FilterBar.svelte';
	import Pagination from './Pagination.svelte';
	import TaskItem from './TaskItem.svelte';
	import { MOTION, dismiss, ms } from '#lib/motion.ts';
	import { notice } from '#lib/notice.svelte.ts';
	import { PAGE_SIZE, clampPage, pageCount, paginate } from '#lib/pagination.ts';
	import { taskStore } from '#lib/task-store.svelte.ts';
	import { allTags, filterTasks, type StatusFilter, type Task } from '#lib/tasks.ts';

	/**
	 * One scope of tasks (a workspace, or the INBOX) with its own filters and pages.
	 * Filters and the page live only in memory, so they reset on reload and when the
	 * scope changes (the parent re-creates this component).
	 */
	let {
		tasks,
		title,
		emptyText = 'No tasks yet. Add one above to start earning XP.'
	}: { tasks: Task[]; title: string; emptyText?: string } = $props();

	let selectedTags = $state<string[]>([]);
	let status = $state<StatusFilter>('all');
	let requestedPage = $state(1);

	const doneCount = $derived(tasks.filter((t) => t.done).length);
	const tagOptions = $derived(allTags(tasks));
	// Ignore selected tags that no task has anymore (e.g. after editing or deleting).
	const activeTags = $derived(selectedTags.filter((t) => tagOptions.includes(t)));
	const visible = $derived(filterTasks(tasks, { tags: activeTags, status }));
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

	/** Opens the page where a task landed, unless the current filters hide it. */
	export function reveal(id: string | undefined) {
		const index = visible.findIndex((t) => t.id === id);
		if (index >= 0) requestedPage = Math.floor(index / PAGE_SIZE) + 1;
	}

	// A new filter always starts on page 1.
	$effect(() => {
		void [activeTags.join(), status];
		requestedPage = 1;
	});

	function labelsFor(taskId: string) {
		const hard = taskStore.tasks.find((t) => t.id === taskId)?.complexity === 'hard';
		return hard
			? { up: 'Milestone completed', down: 'Milestone reopened' }
			: { up: 'Task completed', down: 'Task reopened' };
	}

	function toggle(id: string) {
		const result = taskStore.toggle(id);
		if (result) notice.announce(result, 'Task completed', 'Task reopened');
	}

	function move(id: string, workspaceId: string | undefined) {
		if (!taskStore.move(id, workspaceId)) return;
		notice.say(
			`[✓] Moved to ${workspaceId === undefined ? 'INBOX' : taskStore.workspaceName(workspaceId)}.`
		);
	}
</script>

<section aria-labelledby="list-title" class="flex flex-col gap-4">
	<h2 id="list-title" class="h text-2xl">
		{title} <span class="text-sm font-normal">{doneCount}/{tasks.length}</span>
	</h2>

	{#if taskStore.problem === 'load'}
		<p class="border-2 border-f p-3 text-sm" role="alert">
			[!] Could not load your tasks. Reload the page to try again.
		</p>
	{:else if !taskStore.loaded}
		<p class="text-sm">&gt; loading…</p>
	{:else if tasks.length === 0}
		<p class="text-sm">&gt; {emptyText}</p>
	{:else}
		<FilterBar tags={tagOptions} bind:selected={selectedTags} bind:status />

		{#if visible.length === 0}
			<p class="text-sm">&gt; No tasks match the current filters.</p>
		{:else}
			<ul class="flex scroll-mt-28 flex-col gap-4" bind:this={listEl}>
				{#each pageTasks as task (task.id)}
					<li
						in:slide={{ duration: ms(MOTION.enter) }}
						out:dismiss|global={{ duration: ms(MOTION.exit), x: MOTION.travel }}
					>
						<TaskItem
							{task}
							workspaces={taskStore.workspaces}
							ontoggle={toggle}
							onsave={(id, patch) => taskStore.update(id, patch)}
							onmove={move}
							onremove={(id) =>
								notice.announce(taskStore.remove(id), 'Task moved to trash', 'Task moved to trash')}
							onadditem={(id, itemTitle) =>
								notice.announce(taskStore.addItem(id, itemTitle), 'XP updated', 'XP updated')}
							ontoggleitem={(id, itemId) => {
								const l = labelsFor(id);
								notice.announce(taskStore.toggleItem(id, itemId), l.up, l.down);
							}}
							onremoveitem={(id, itemId) =>
								notice.announce(taskStore.removeItem(id, itemId), 'XP updated', 'XP updated')}
						/>
					</li>
				{/each}
			</ul>
			<Pagination bind:page={() => page, goToPage} count={pageCount(visible.length)} />
		{/if}
	{/if}
</section>
