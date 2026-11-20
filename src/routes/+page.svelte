<script lang="ts">
	import { onMount } from 'svelte';
	import AccountMenu from '#lib/components/AccountMenu.svelte';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import Calendar from '#lib/components/Calendar.svelte';
	import LevelCard from '#lib/components/LevelCard.svelte';
	import Notices from '#lib/components/Notices.svelte';
	import TaskForm from '#lib/components/TaskForm.svelte';
	import Welcome from '#lib/components/Welcome.svelte';
	import TaskList from '#lib/components/TaskList.svelte';
	import Trash from '#lib/components/Trash.svelte';
	import WorkspaceCard from '#lib/components/WorkspaceCard.svelte';
	import WorkspaceForm from '#lib/components/WorkspaceForm.svelte';
	import { currentStreak } from '#lib/activity.ts';
	import { app } from '#lib/app.svelte.ts';
	import { notice } from '#lib/notice.svelte.ts';
	import { SITE_DESCRIPTION, SITE_URL } from '#lib/site.ts';
	import { taskStore } from '#lib/task-store.svelte.ts';
	import { clock } from '#lib/today.svelte.ts';
	import { INBOX_ID, MAX_WORKSPACES, tasksIn, workspaceStats } from '#lib/workspaces.ts';
	import type { Schedule } from '#lib/tasks.ts';
	import type { Complexity } from '#lib/xp.ts';

	onMount(() => {
		clock.start();
		void app.start();
	});

	const inbox = $derived(tasksIn(taskStore.tasks, undefined));
	let list = $state<ReturnType<typeof TaskList>>();
	let form = $state<ReturnType<typeof TaskForm>>();

	function addTask(
		title: string,
		complexity: Complexity,
		tags: string[],
		workspaceId?: string,
		schedule?: Schedule
	) {
		const id = taskStore.add(title, complexity, tags, workspaceId, schedule);
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
	<meta name="description" content={SITE_DESCRIPTION} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content="HUD//QUEST — To-Do" />
	<meta property="og:description" content={SITE_DESCRIPTION} />
	<meta property="og:url" content={SITE_URL} />
</svelte:head>

<div class="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
	<AppHeader>
		{#snippet account()}
			<AccountMenu onsignout={() => app.signOut()} />
		{/snippet}
	</AppHeader>

	<main class="mt-8 flex flex-col gap-10">
		<h1 class="h text-4xl sm:text-5xl">_TASKS;</h1>

		<Welcome
			fresh={taskStore.loaded &&
				taskStore.tasks.length === 0 &&
				taskStore.trash.length === 0 &&
				taskStore.workspaces.length === 0 &&
				Object.keys(taskStore.activity).length === 0}
		/>

		<LevelCard
			info={taskStore.levelInfo}
			totalXp={taskStore.xp}
			streak={taskStore.loaded ? currentStreak(taskStore.activity, clock.today) : undefined}
		/>

		<Calendar onadd={(day) => form?.prefill(day)} />

		<Notices />

		<TaskForm
			bind:this={form}
			disabled={!taskStore.loaded}
			workspaces={taskStore.workspaces}
			onadd={addTask}
		/>

		<section aria-labelledby="workspaces-title" class="sect flex flex-col gap-4">
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
