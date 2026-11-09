<script lang="ts">
	import { slide } from 'svelte/transition';
	import Pagination from './Pagination.svelte';
	import { MOTION, dismiss, ms } from '#lib/motion.ts';
	import { clampPage, pageCount, paginate } from '#lib/pagination.ts';
	import { TRASH_DAYS, daysLeftInTrash, type Task } from '#lib/tasks.ts';

	let {
		tasks,
		originOf,
		onrestore,
		onpurge,
		onempty
	}: {
		tasks: Task[];
		/** Where a trashed task came from: its workspace name or INBOX. */
		originOf: (task: Task) => string;
		onrestore: (id: string) => void;
		onpurge: (id: string) => void;
		onempty: () => void;
	} = $props();

	let open = $state(false);
	let requestedPage = $state(1);
	// Clamped, so emptying the last page falls back to the previous one.
	const page = $derived(clampPage(requestedPage, tasks.length));
	const pageTasks = $derived(paginate(tasks, page));
	// How the next row leaves: restored rows fly back to the left (towards the task list),
	// deleted ones fly out to the right like in the task list, and closing the panel is silent
	// because the panel itself already collapses.
	let leaving = $state<'restore' | 'purge' | 'close'>('purge');
	// An empty trash disappears; the next time it shows up it starts closed.
	$effect(() => {
		if (tasks.length === 0) open = false;
	});
	// Evaluated when the list changes; good enough for a "days left" label.
	const now = $derived((void tasks, Date.now()));
</script>

{#if tasks.length > 0}
	<section
		aria-labelledby="trash-title"
		class="flex flex-col gap-4"
		data-testid="trash"
		transition:slide={{ duration: ms(MOTION.enter) }}
	>
		<h2 id="trash-title" class="h text-2xl">
			<button
				type="button"
				class="inline-flex min-h-11 items-center gap-2 text-left"
				aria-expanded={open}
				aria-controls="trash-list"
				onclick={() => {
					leaving = 'close';
					open = !open;
				}}
			>
				{open ? '[-]' : '[+]'} _TRASH;
				{#key tasks.length}
					<span class="pop text-sm font-normal">{tasks.length}</span>
				{/key}
			</button>
		</h2>

		{#if open}
			<div
				id="trash-list"
				class="flex flex-col gap-4"
				transition:slide={{ duration: ms(MOTION.enter) }}
			>
				<p class="text-xs">
					&gt; Deleted tasks stay here for {TRASH_DAYS} days and give no XP. Restore one to get it back.
				</p>
				<ul class="flex flex-col gap-3">
					{#each pageTasks as task (task.id)}
						<li
							class="flex flex-wrap items-center gap-3 border-2 border-f p-3"
							in:slide={{ duration: ms(MOTION.enter) }}
							out:dismiss|global={{
								duration: ms(leaving === 'close' ? 0 : MOTION.exit),
								x: leaving === 'restore' ? -MOTION.travel : MOTION.travel
							}}
						>
							<div class="flex min-w-0 flex-1 flex-col gap-1">
								<span class="break-words opacity-75">{task.title}</span>
								<span class="text-xs opacity-75">from {originOf(task)}</span>
								{#if task.tags.length > 0}
									<ul class="flex flex-wrap gap-1 opacity-75" aria-label="Tags">
										{#each task.tags as tag (tag)}
											<li class="tag">#{tag}</li>
										{/each}
									</ul>
								{/if}
							</div>
							<span class="tag">{daysLeftInTrash(task, now)}d left</span>
							<div class="flex gap-2">
								<button
									type="button"
									class="btn o sm"
									onclick={() => {
										leaving = 'restore';
										onrestore(task.id);
									}}
									aria-label={`Restore "${task.title}"`}
								>
									RESTORE
								</button>
								<button
									type="button"
									class="btn o sm"
									onclick={() => {
										leaving = 'purge';
										onpurge(task.id);
									}}
									aria-label={`Delete "${task.title}" forever`}
								>
									DELETE FOREVER
								</button>
							</div>
						</li>
					{/each}
				</ul>
				<Pagination
					bind:page={() => page, (p) => (requestedPage = p)}
					count={pageCount(tasks.length)}
					label="Trash pagination"
				/>
				<button
					type="button"
					class="btn o sm self-start"
					onclick={() => {
						leaving = 'purge';
						onempty();
					}}
				>
					EMPTY TRASH
				</button>
			</div>
		{/if}
	</section>
{/if}
