<script lang="ts">
	import { onMount, tick } from 'svelte';
	import {
		WEEKDAYS,
		canShift,
		canShiftWeek,
		cellMark,
		describeDay,
		monthGrid,
		monthOf,
		monthTitle,
		shiftMonth,
		tallyByDay,
		tasksOn,
		weekGrid,
		weekStartOf,
		weekTitle
	} from '#lib/calendar.ts';
	import { addDays, formatDay, isDayKey } from '#lib/dates.ts';
	import { notice } from '#lib/notice.svelte.ts';
	import { session } from '#lib/session.svelte.ts';
	import { taskStore } from '#lib/task-store.svelte.ts';
	import { clock } from '#lib/today.svelte.ts';
	import { canMarkDone, type Task } from '#lib/tasks.ts';

	/** The tasks that have a due date, by month or by week, and the tasks of the day that was picked. */
	let {
		onadd,
		tasks = undefined
	}: {
		onadd: (day: string) => void;
		/** Only these tasks are shown (a workspace). Leave out to show every task. */
		tasks?: Task[];
	} = $props();

	type View = 'month' | 'week';

	const shown = $derived(tasks ?? taskStore.tasks);

	/** A month on wide screens; small screens start on the week, which needs far less room. */
	let view = $state<View>('month');
	let month = $state(monthOf(clock.today));
	let weekStart = $state(weekStartOf(clock.today));
	/** Today is picked at first; picking the same day again clears it. */
	let selected = $state<string | null>(clock.today);
	/** The day that has the keyboard focus, so the arrow keys know where to start. */
	let focused = $state<string | null>(null);
	/** The task being dragged and the day it is over. */
	let dragging = $state<string | null>(null);
	let over = $state<string | null>(null);
	let gridEl = $state<HTMLElement>();

	onMount(() => {
		if (matchMedia('(max-width: 639px)').matches) view = 'week';
	});

	const visible = $derived(view === 'month' ? monthGrid(month) : weekGrid(weekStart));
	const rows = $derived(
		view === 'month'
			? Array.from({ length: 6 }, (_, i) => visible.slice(i * 7, i * 7 + 7))
			: [visible]
	);
	const title = $derived(view === 'month' ? monthTitle(month) : weekTitle(weekStart, clock.today));
	const canGoBack = $derived(view === 'month' ? canShift(month, -1) : canShiftWeek(weekStart, -1));
	const canGoOn = $derived(view === 'month' ? canShift(month, 1) : canShiftWeek(weekStart, 1));
	const tally = $derived(tallyByDay(shown, clock.today));
	const dayTasks = $derived(selected ? tasksOn(shown, selected) : []);
	// Only one day takes part in the tab order; the arrow keys move between the others.
	const tabStop = $derived(
		[focused, selected, clock.today].find((d) => d && visible.includes(d)) ??
			(view === 'month' ? `${month}-01` : weekStart)
	);

	/** Keeps what is on screen when the view changes: the picked day (or today) stays in view. */
	function setView(next: View) {
		if (next === view) return;
		if (next === 'week') {
			const anchor = [selected, clock.today].find((d) => d && monthOf(d) === month);
			weekStart = weekStartOf(anchor ?? `${month}-01`);
		} else {
			// The month that holds most of the week, so the week is fully on screen.
			month = monthOf(addDays(weekStart, 3));
		}
		view = next;
	}

	function pick(day: string) {
		selected = selected === day ? null : day;
		// A day shown from the next or previous month brings that month with it.
		if (view === 'month' && monthOf(day) !== month) month = monthOf(day);
	}

	function go(n: number) {
		if (view === 'month') {
			if (canShift(month, n)) month = shiftMonth(month, n);
		} else if (canShiftWeek(weekStart, n)) {
			weekStart = addDays(weekStart, 7 * n);
		}
	}

	function goToday() {
		month = monthOf(clock.today);
		weekStart = weekStartOf(clock.today);
		selected = clock.today;
	}

	async function keys(e: KeyboardEvent) {
		const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
		const day = (e.target as HTMLElement).dataset.day;
		if (step === undefined || !day) return;
		e.preventDefault();
		const target = addDays(day, step);
		if (!visible.includes(target)) {
			// Past the edge of what is shown: bring the neighbouring month or week and keep going.
			if (view === 'month') month = monthOf(target);
			else weekStart = weekStartOf(target);
			await tick();
		}
		gridEl?.querySelector<HTMLElement>(`[data-day="${target}"]`)?.focus();
	}

	function toggle(id: string) {
		const result = taskStore.toggle(id);
		if (result) notice.announce(result, 'Task completed', 'Task reopened');
	}

	/** Gives an open task another due day. Repeats and everything else stay as they were. */
	function reschedule(id: string, day: string) {
		const task = taskStore.tasks.find((t) => t.id === id);
		if (!task || task.done || !isDayKey(day) || day === task.dueDate) return;
		taskStore.update(id, { dueDate: day });
		notice.say(`[✓] Moved to ${formatDay(day, clock.today)}.`);
	}

	function changeDay(e: Event & { currentTarget: HTMLInputElement }, id: string, current?: string) {
		const input = e.currentTarget;
		if (!isDayKey(input.value)) input.value = current ?? '';
		else reschedule(id, input.value);
	}

	function drop(e: DragEvent, day: string) {
		e.preventDefault();
		const id = dragging;
		dragging = over = null;
		if (id) reschedule(id, day);
	}
</script>

<section
	aria-labelledby="calendar-title"
	class="sect flex flex-col gap-4"
	data-testid="calendar"
	data-view={view}
>
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h2 id="calendar-title" class="h text-2xl">_CALENDAR;</h2>
		<div class="flex gap-2" role="group" aria-label="Calendar view">
			{#each ['week', 'month'] as const as option (option)}
				<button
					type="button"
					class="btn sm {view === option ? '' : 'o'}"
					aria-pressed={view === option}
					data-testid="view-{option}"
					onclick={() => setView(option)}
				>
					{option.toUpperCase()}
				</button>
			{/each}
		</div>
	</div>

	<div class="brk flex flex-col gap-3 p-4">
		<div class="flex items-center justify-between gap-2">
			<button
				type="button"
				class="btn o sm"
				aria-label="Previous {view}"
				disabled={!canGoBack}
				onclick={() => go(-1)}>&lt;</button
			>
			<div class="flex flex-wrap items-center justify-center gap-2">
				<span class="h text-lg" aria-live="polite" data-testid="month-title">{title}</span>
				<button type="button" class="btn o sm" onclick={goToday} data-testid="calendar-today">
					TODAY
				</button>
			</div>
			<button
				type="button"
				class="btn o sm"
				aria-label="Next {view}"
				disabled={!canGoOn}
				onclick={() => go(1)}>&gt;</button
			>
		</div>

		<table class="w-full table-fixed border-separate border-spacing-1" bind:this={gridEl}>
			<thead>
				<tr>
					{#each WEEKDAYS as name (name)}
						<th scope="col" class="pb-1 text-xs font-normal">{name}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each rows as week (week[0])}
					<tr>
						{#each week as day (day)}
							{@const mark = cellMark(tally[day])}
							<td>
								<button
									type="button"
									data-testid="day"
									data-day={day}
									data-mark={mark}
									aria-pressed={selected === day}
									aria-label={describeDay(day, tally[day]) +
										(day === clock.today ? ' (today)' : '')}
									tabindex={day === tabStop ? 0 : -1}
									class="flex w-full flex-col items-start justify-between border-2 p-1 text-left text-xs {view ===
									'week'
										? 'h-16'
										: 'h-12 sm:h-14'} {selected === day
										? 'border-f bg-f text-b'
										: tally[day]
											? 'border-f'
											: 'border-f/25'} {view === 'month' &&
									monthOf(day) !== month &&
									selected !== day
										? 'opacity-60'
										: ''} {day === clock.today ? 'gline' : ''} {over === day
										? 'outline-2 outline-offset-1 outline-dashed'
										: ''}"
									onclick={() => pick(day)}
									onkeydown={keys}
									onfocus={() => (focused = day)}
									ondragover={(e) => {
										if (!dragging) return;
										e.preventDefault();
										over = day;
									}}
									ondragleave={() => (over = over === day ? null : over)}
									ondrop={(e) => drop(e, day)}
								>
									<span class="text-sm font-bold">{Number(day.slice(8))}</span>
									<span aria-hidden="true">{mark}</span>
								</button>
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="flex flex-col gap-3" aria-live="polite" data-testid="day-panel">
		{#if selected}
			<div class="flex flex-wrap items-center justify-between gap-3">
				<h3 class="h text-lg" data-testid="day-title">
					{formatDay(selected, clock.today)}{selected === clock.today ? ' · TODAY' : ''}
					<span class="text-sm font-normal">
						{dayTasks.length}
						{dayTasks.length === 1 ? 'task' : 'tasks'}
					</span>
				</h3>
				<button type="button" class="btn g sm" onclick={() => onadd(selected!)}>+ ADD &gt;</button>
			</div>

			{#if session.blocked}
				<p class="text-sm">&gt; Offline. Reconnect to see your tasks.</p>
			{:else if !taskStore.loaded}
				<p class="text-sm">&gt; loading…</p>
			{:else if dayTasks.length === 0}
				<p class="text-sm">&gt; Nothing due on this day.</p>
			{:else}
				<ul class="flex flex-col gap-3">
					{#each dayTasks as task (task.id)}
						{@const gated = !canMarkDone(task)}
						<li
							class="flex flex-col gap-3 border-2 border-f p-3 {dragging === task.id
								? 'opacity-50'
								: ''}"
							data-testid="day-task"
							draggable={!task.done}
							ondragstart={(e) => {
								dragging = task.id;
								e.dataTransfer?.setData('text/plain', task.id);
							}}
							ondragend={() => (dragging = over = null)}
						>
							<!-- The whole title gets its own line, so a long one is never squeezed by the controls. -->
							<div class="flex items-start gap-3">
								<button
									type="button"
									role="checkbox"
									aria-checked={task.done}
									aria-label={task.done
										? `Reopen "${task.title}" from the calendar`
										: `Finish "${task.title}" from the calendar`}
									title={gated ? 'Completes automatically when every item is done' : undefined}
									class="chk inline-flex h-10 shrink-0 items-center gap-2 border-2 border-f px-2 text-xs font-bold {task.done
										? 'bg-f text-b'
										: ''} {gated
										? 'cursor-not-allowed opacity-50'
										: task.done
											? ''
											: 'hover:bg-f hover:text-b'}"
									disabled={gated}
									onclick={() => toggle(task.id)}
								>
									<span aria-hidden="true">{task.done ? '[X]' : '[ ]'}</span>
									<span aria-hidden="true">{gated ? 'AUTO' : task.done ? 'UNDO' : 'DO IT'}</span>
								</button>
								<span class="wrap flex-1 pt-2" class:line-through={task.done}>{task.title}</span>
							</div>
							<div class="flex flex-wrap items-center gap-2">
								<span class="tag">{task.complexity.toUpperCase()}</span>
								<span class="tag" data-testid="day-task-place">{taskStore.originOf(task)}</span>
								{#if !task.done}
									<label class="flex items-center gap-2 text-xs">
										MOVE_
										<input
											class="inp sm w-40"
											type="date"
											value={task.dueDate}
											aria-label={`Move "${task.title}" to another day`}
											onchange={(e) => changeDay(e, task.id, task.dueDate)}
										/>
									</label>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
				<p class="text-xs">&gt; Drag an open task onto another day, or pick a date, to move it.</p>
			{/if}
		{:else}
			<p class="text-sm">&gt; Pick a day to see its tasks.</p>
		{/if}
	</div>
</section>
