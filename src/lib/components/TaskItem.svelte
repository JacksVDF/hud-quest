<script lang="ts">
	import { slide } from 'svelte/transition';
	import Checklist from './Checklist.svelte';
	import ProgressBar from './ProgressBar.svelte';
	import TagInput from './TagInput.svelte';
	import { dismiss, ms } from '#lib/motion.ts';
	import { MAX_NOTES_LENGTH, canMarkDone, taskXp, type Task } from '#lib/tasks.ts';
	import { XP_BY_COMPLEXITY } from '#lib/xp.ts';

	let {
		task,
		ontoggle,
		onsave,
		onremove,
		onadditem,
		ontoggleitem,
		onremoveitem
	}: {
		task: Task;
		ontoggle: (id: string) => void;
		onsave: (id: string, patch: { title?: string; tags?: string[]; notes?: string }) => void;
		onremove: (id: string) => void;
		onadditem: (taskId: string, title: string) => void;
		ontoggleitem: (taskId: string, itemId: string) => void;
		onremoveitem: (taskId: string, itemId: string) => void;
	} = $props();

	let editing = $state(false);
	let open = $state(false);
	let draftTitle = $state('');
	let draftTags = $state<string[]>([]);
	let draftNotes = $state('');

	const isProject = $derived(task.complexity === 'hard');
	const hasPanel = $derived(task.complexity !== 'easy');
	const gated = $derived(!canMarkDone(task));
	const itemsDone = $derived(task.items.filter((i) => i.done).length);
	const maxXp = $derived(XP_BY_COMPLEXITY[task.complexity]);
	const earned = $derived(taskXp(task));
	const noun = $derived(isProject ? 'milestone' : 'subtask');
	const panelId = $derived(`panel-${task.id}`);

	function startEdit() {
		draftTitle = task.title;
		draftTags = [...task.tags];
		editing = true;
	}

	function save(e: SubmitEvent) {
		e.preventDefault();
		if (!draftTitle.trim()) return;
		onsave(task.id, { title: draftTitle, tags: draftTags });
		editing = false;
	}

	function openPanel() {
		open = !open;
		if (open) draftNotes = task.notes;
	}

	function saveNotes() {
		if (draftNotes !== task.notes) onsave(task.id, { notes: draftNotes });
	}
</script>

<li class="brk p-4" in:slide={{ duration: ms(220) }} out:dismiss|global={{ duration: ms(320) }}>
	{#if editing}
		<form class="flex flex-col gap-3" onsubmit={save}>
			<input class="inp" bind:value={draftTitle} maxlength="120" required aria-label="Task title" />
			<TagInput bind:tags={draftTags} />
			<div class="flex gap-2">
				<button type="submit" class="btn" disabled={!draftTitle.trim()}>SAVE</button>
				<button type="button" class="btn o" onclick={() => (editing = false)}>CANCEL</button>
			</div>
		</form>
	{:else}
		<div class="flex flex-wrap items-center gap-3">
			<button
				type="button"
				role="checkbox"
				aria-checked={task.done}
				aria-disabled={gated}
				aria-label={task.done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
				class="chk h-11 w-14 shrink-0 border-2 border-f font-bold {gated
					? 'cursor-not-allowed opacity-50'
					: ''}"
				disabled={gated}
				onclick={() => ontoggle(task.id)}
			>
				{task.done ? '[X]' : '[ ]'}
			</button>
			<span
				class="min-w-0 flex-1 break-words transition-opacity duration-200"
				class:line-through={task.done}
				class:opacity-75={task.done}
			>
				{task.title}
			</span>
			<span class="tag" class:s={task.done}>
				{isProject && task.items.length > 0 ? `+${earned}/${maxXp}` : `+${maxXp}`} XP
			</span>
			<span class="tag">{task.complexity.toUpperCase()}</span>
			<div class="flex gap-2">
				<button type="button" class="btn o" onclick={startEdit} aria-label={`Edit "${task.title}"`}>
					EDIT
				</button>
				<button
					type="button"
					class="btn o"
					onclick={() => onremove(task.id)}
					aria-label={`Delete "${task.title}"`}
				>
					DEL
				</button>
			</div>
		</div>

		{#if task.tags.length > 0}
			<ul class="mt-3 flex flex-wrap gap-2" aria-label="Tags">
				{#each task.tags as tag (tag)}
					<li class="tag">#{tag}</li>
				{/each}
			</ul>
		{/if}

		{#if hasPanel}
			<div class="mt-3 flex flex-wrap items-center gap-3 text-xs">
				<button
					type="button"
					class="btn o sm"
					aria-expanded={open}
					aria-controls={panelId}
					onclick={openPanel}
				>
					{open ? '[-]' : '[+]'}
					{isProject ? 'PROJECT' : 'SUBTASKS'}
					{#if task.items.length > 0}({itemsDone}/{task.items.length}){/if}
				</button>
				{#if gated && !isProject && !task.done}
					<span>&gt; completes automatically when all subtasks are done</span>
				{/if}
			</div>

			{#if open}
				<div
					id={panelId}
					class="mt-3 flex flex-col gap-3 border-t-2 border-f pt-3"
					transition:slide={{ duration: ms(220) }}
				>
					{#if isProject && task.items.length > 0}
						<ProgressBar
							value={itemsDone}
							max={task.items.length}
							label="Milestones completed"
							compact
						/>
						<p class="text-xs">
							&gt; {earned}/{maxXp} XP released ({itemsDone}/{task.items.length} milestones)
						</p>
					{/if}

					<Checklist
						items={task.items}
						{noun}
						onadd={(title) => onadditem(task.id, title)}
						ontoggle={(itemId) => ontoggleitem(task.id, itemId)}
						onremove={(itemId) => onremoveitem(task.id, itemId)}
					/>

					{#if isProject}
						<label class="text-xs">
							NOTES_
							<textarea
								class="inp mt-1 min-h-24 py-2"
								bind:value={draftNotes}
								maxlength={MAX_NOTES_LENGTH}
								placeholder="project notes"
								onblur={saveNotes}></textarea>
						</label>
					{/if}
				</div>
			{/if}
		{/if}
	{/if}
</li>
