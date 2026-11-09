<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import AccountMenu from '#lib/components/AccountMenu.svelte';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import LevelCard from '#lib/components/LevelCard.svelte';
	import Notices from '#lib/components/Notices.svelte';
	import TaskForm from '#lib/components/TaskForm.svelte';
	import TaskList from '#lib/components/TaskList.svelte';
	import WorkspaceHeader from '#lib/components/WorkspaceHeader.svelte';
	import { app } from '#lib/app.svelte.ts';
	import { notice } from '#lib/notice.svelte.ts';
	import { taskStore } from '#lib/task-store.svelte.ts';
	import { INBOX_ID, tasksIn, workspaceKey, workspaceStats } from '#lib/workspaces.ts';
	import type { Complexity } from '#lib/xp.ts';

	onMount(() => void app.start());

	const routeId = $derived(page.params.id ?? '');
	const isInbox = $derived(routeId === INBOX_ID);
	const key = $derived(workspaceKey(routeId));
	const name = $derived(isInbox ? 'INBOX' : taskStore.workspaceName(routeId));
	const known = $derived(isInbox || name !== '');
	const tasks = $derived(tasksIn(taskStore.tasks, key));
	const stats = $derived(workspaceStats(tasks));

	// A workspace that does not exist (wrong link, or deleted elsewhere) goes back to the start.
	let deleting = false;
	$effect(() => {
		if (taskStore.loaded && !known && !deleting) void goto(resolve('/'), { replaceState: true });
	});

	let list = $state<ReturnType<typeof TaskList>>();

	function addTask(title: string, complexity: Complexity, tags: string[]) {
		// Tasks made here belong here.
		const id = taskStore.add(title, complexity, tags, key);
		queueMicrotask(() => list?.reveal(id));
	}

	function rename(next: string): string {
		const result = taskStore.renameWorkspace(routeId, next);
		return 'error' in result ? result.error : '';
	}

	async function remove() {
		// Read before deleting: afterwards the workspace and its tasks are gone.
		const count = tasks.length;
		const deletedName = name;
		deleting = true;
		const change = taskStore.removeWorkspace(routeId);
		await goto(resolve('/'));
		notice.say(
			`[!] ${deletedName} deleted. ${count} task${count === 1 ? '' : 's'} moved to trash${
				change.delta === 0 ? '' : `: ${change.delta} XP`
			}.`
		);
	}
</script>

<svelte:head>
	<title>{name || 'Workspace'} — HUD//QUEST</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
	<AppHeader>
		{#snippet account()}
			<AccountMenu onsignout={() => app.signOut()} />
		{/snippet}
	</AppHeader>

	<main class="mt-8 flex flex-col gap-8">
		<a class="text-sm underline" href={resolve('/')}>&lt; ALL WORKSPACES</a>

		{#if taskStore.loaded && known}
			<WorkspaceHeader
				{name}
				open={stats.open}
				allowEdit={!isInbox}
				onrename={rename}
				ondelete={remove}
			/>
		{:else if !taskStore.loaded}
			<p class="text-sm">&gt; loading…</p>
		{/if}

		<LevelCard info={taskStore.levelInfo} totalXp={taskStore.xp} />

		{#if known}
			<TaskForm disabled={!taskStore.loaded} onadd={addTask} />
		{/if}

		<Notices />

		{#if known}
			{#key routeId}
				<TaskList
					bind:this={list}
					{tasks}
					title="_MISSIONS;"
					emptyText="No tasks here yet. Add one above."
				/>
			{/key}
		{/if}
	</main>

	<footer class="mt-16 border-t-2 border-f pt-4 text-xs">HANDLE_WITH_CARE;</footer>
</div>
