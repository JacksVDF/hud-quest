<script lang="ts">
	import { onMount } from 'svelte';
	import AccountMenu from '#lib/components/AccountMenu.svelte';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import LevelCard from '#lib/components/LevelCard.svelte';
	import Notices from '#lib/components/Notices.svelte';
	import TaskForm from '#lib/components/TaskForm.svelte';
	import TaskList from '#lib/components/TaskList.svelte';
	import Trash from '#lib/components/Trash.svelte';
	import WorkspaceCard from '#lib/components/WorkspaceCard.svelte';
	import WorkspaceForm from '#lib/components/WorkspaceForm.svelte';
	import { app } from '#lib/app.svelte.ts';
	import { notice } from '#lib/notice.svelte.ts';
	import { taskStore } from '#lib/task-store.svelte.ts';
	import { INBOX_ID, MAX_WORKSPACES, tasksIn, workspaceStats } from '#lib/workspaces.ts';
	import type { Complexity } from '#lib/xp.ts';

	onMount(() => void app.start());

	const inbox = $derived(tasksIn(taskStore.tasks, undefined));
	let list = $state<ReturnType<typeof TaskList>>();

	function addTask(title: string, complexity: Complexity, tags: string[], workspaceId?: string) {
		const id = taskStore.add(title, complexity, tags, workspaceId);
		if (workspaceId === undefined) {
			// Wait for the list to include the new task before looking for its page.
			queueMicrotask(() => list?.reveal(id));
		} else {
			notice.say(`[✓] Added to ${taskStore.workspaceName(workspaceId)}.`);
		}
	}

	function addWorkspace(name: string): string {
		const result = taskStore.addWorkspace(name);
		return 'error' in result ? result.error : '';
	}
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
			<AccountMenu onsignout={() => app.signOut()} />
		{/snippet}
	</AppHeader>

	<main class="mt-8 flex flex-col gap-8">
		<h1 class="h text-4xl sm:text-5xl">_TASKS;</h1>

		<LevelCard info={taskStore.levelInfo} totalXp={taskStore.xp} />

		<TaskForm disabled={!taskStore.loaded} workspaces={taskStore.workspaces} onadd={addTask} />

		<Notices />

		<section aria-labelledby="workspaces-title" class="flex flex-col gap-4">
			<h2 id="workspaces-title" class="h text-2xl">
				_WORKSPACES; <span class="text-sm font-normal"
					>{taskStore.workspaces.length}/{MAX_WORKSPACES}</span
				>
			</h2>
			{#if taskStore.loaded}
				<ul class="grid gap-4 sm:grid-cols-2">
					<li>
						<WorkspaceCard name="INBOX" routeId={INBOX_ID} stats={workspaceStats(inbox)} />
					</li>
					{#each taskStore.workspaces as w (w.id)}
						<li>
							<WorkspaceCard
								name={w.name}
								routeId={w.id}
								stats={workspaceStats(tasksIn(taskStore.tasks, w.id))}
							/>
						</li>
					{/each}
				</ul>
				{#if taskStore.workspaces.length < MAX_WORKSPACES}
					<WorkspaceForm onadd={addWorkspace} />
				{:else}
					<p class="text-xs">&gt; Workspace limit reached ({MAX_WORKSPACES}).</p>
				{/if}
			{:else}
				<p class="text-sm">&gt; loading…</p>
			{/if}
		</section>

		<TaskList
			bind:this={list}
			tasks={inbox}
			title="_INBOX;"
			emptyText="No tasks yet. Add one above to start earning XP."
		/>

		<Trash
			tasks={taskStore.trash}
			originOf={(t) => taskStore.originOf(t)}
			onrestore={(id) => notice.announce(taskStore.restore(id), 'Task restored', 'Task restored')}
			onpurge={(id) => taskStore.purge(id)}
			onempty={() => taskStore.emptyTrash()}
		/>
	</main>

	<footer class="mt-16 border-t-2 border-f pt-4 text-xs">HANDLE_WITH_CARE;</footer>
</div>
