<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import AccountMenu from '#lib/components/AccountMenu.svelte';
	import ActivityChart from '#lib/components/ActivityChart.svelte';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import { bestStreak, currentStreak, lastDays, totalsFor } from '#lib/activity.ts';
	import { app } from '#lib/app.svelte.ts';
	import { session } from '#lib/session.svelte.ts';
	import { taskStore } from '#lib/task-store.svelte.ts';
	import { clock } from '#lib/today.svelte.ts';

	onMount(() => {
		clock.start();
		void app.start();
	});

	const today = $derived(clock.today);
	const activity = $derived(taskStore.activity);
	const current = $derived(currentStreak(activity, today));
	const best = $derived(Math.max(bestStreak(activity), current));
	const week = $derived(totalsFor(activity, today, 7));
	const month = $derived(totalsFor(activity, today, 30));
	const bars = $derived(lastDays(activity, today, 14));
	const empty = $derived(Object.keys(activity).length === 0);
	const COMPLEXITY_ROWS = ['easy', 'medium', 'hard'] as const;
</script>

<svelte:head>
	<title>STATS — HUD//QUEST</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
	<AppHeader>
		{#snippet account()}
			<AccountMenu onsignout={() => app.signOut()} />
		{/snippet}
	</AppHeader>

	<main class="mt-8 flex flex-col gap-8">
		<a class="text-sm underline" href={resolve('/')}>&lt; BACK TO TASKS</a>
		<h1 class="h text-4xl sm:text-5xl">_STATS;</h1>

		{#if session.blocked}
			<p class="text-sm" data-testid="offline-blocked">
				&gt; Offline. Reconnect to see your stats.
			</p>
		{:else if !taskStore.loaded}
			<p class="text-sm">&gt; loading…</p>
		{:else if empty}
			<p class="text-sm" data-testid="stats-empty">
				&gt; Nothing here yet. Complete a task to start your streak.
			</p>
		{:else}
			<section aria-label="Streaks" class="grid grid-cols-2 gap-4">
				<div class="brk p-5">
					<div class="text-xs">CURRENT STREAK</div>
					<div class="h text-5xl leading-none" data-testid="current-streak">{current}</div>
					<div class="mt-1 text-xs">{current === 1 ? 'day' : 'days'}</div>
				</div>
				<div class="brk p-5">
					<div class="text-xs">BEST STREAK</div>
					<div class="h text-5xl leading-none" data-testid="best-streak">{best}</div>
					<div class="mt-1 text-xs">{best === 1 ? 'day' : 'days'}</div>
				</div>
			</section>

			<section aria-labelledby="recent-title" class="flex flex-col gap-4">
				<h2 id="recent-title" class="h text-2xl">_LAST_14_DAYS;</h2>
				<ActivityChart {bars} {today} />
			</section>

			<section aria-labelledby="totals-title" class="flex flex-col gap-4">
				<h2 id="totals-title" class="h text-2xl">_TOTALS;</h2>
				<table class="w-full border-2 border-f text-left text-sm" data-testid="totals">
					<thead>
						<tr class="border-b-2 border-f">
							<th class="p-3 font-bold" scope="col"><span class="sr-only">PERIOD</span></th>
							<th class="p-3 font-bold" scope="col">7 DAYS</th>
							<th class="p-3 font-bold" scope="col">30 DAYS</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-b border-f">
							<th class="p-3 font-normal" scope="row">TASKS</th>
							<td class="p-3" data-testid="week-tasks">{week.tasks}</td>
							<td class="p-3" data-testid="month-tasks">{month.tasks}</td>
						</tr>
						<tr class="border-b border-f">
							<th class="p-3 font-normal" scope="row">XP</th>
							<td class="p-3" data-testid="week-xp">{week.xp}</td>
							<td class="p-3" data-testid="month-xp">{month.xp}</td>
						</tr>
						{#each COMPLEXITY_ROWS as c (c)}
							<tr class="border-f not-last:border-b">
								<th class="p-3 font-normal" scope="row">{c.toUpperCase()}</th>
								<td class="p-3">{week[c]}</td>
								<td class="p-3">{month[c]}</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<p class="text-xs">
					&gt; Days follow your own time zone. A streak ends only after a whole day with nothing
					completed. History keeps the last 365 days.
				</p>
			</section>
		{/if}
	</main>

	<footer class="mt-16 border-t-2 border-f pt-4 text-xs">HANDLE_WITH_CARE;</footer>
</div>
