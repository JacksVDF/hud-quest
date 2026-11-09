<script lang="ts">
	import ComplexityPicker from './ComplexityPicker.svelte';
	import TagInput from './TagInput.svelte';
	import type { Complexity } from '#lib/xp.ts';
	import type { Workspace } from '#lib/workspaces.ts';

	let {
		onadd,
		disabled = false,
		workspaces = []
	}: {
		onadd: (title: string, complexity: Complexity, tags: string[], workspaceId?: string) => void;
		/** When given, the form offers them (and the INBOX) as the place for the new task. */
		workspaces?: Workspace[];
		/** True while the task list is still loading, so nothing typed is silently dropped. */
		disabled?: boolean;
	} = $props();

	let title = $state('');
	let complexity = $state<Complexity>('easy');
	let tags = $state<string[]>([]);
	/** '' is the INBOX. */
	let workspaceId = $state('');

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (disabled || !title.trim()) return;
		onadd(title, complexity, tags, workspaceId || undefined);
		title = '';
		tags = [];
	}
</script>

<form class="flex flex-col gap-4" onsubmit={submit}>
	<div class="flex flex-col gap-3 sm:flex-row sm:items-end">
		<label class="flex-1 text-xs">
			NEW_TASK_
			<input
				class="inp mt-1"
				bind:value={title}
				placeholder="write here"
				maxlength="120"
				required
			/>
		</label>
		<ComplexityPicker bind:value={complexity} />
	</div>
	<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div class="flex flex-col gap-3 sm:max-w-xl sm:flex-1 sm:flex-row sm:items-start">
			<div class="sm:max-w-sm sm:flex-1">
				<TagInput bind:tags compact={false} />
			</div>
			{#if workspaces.length > 0}
				<label class="text-xs sm:w-48">
					WORKSPACE_
					<select class="inp mt-1" bind:value={workspaceId} data-testid="new-task-workspace">
						<option value="">INBOX</option>
						{#each workspaces as w (w.id)}
							<option value={w.id}>{w.name}</option>
						{/each}
					</select>
				</label>
			{/if}
		</div>
		<button type="submit" class="btn g self-start sm:mt-5" disabled={disabled || !title.trim()}>
			ADD &gt;
		</button>
	</div>
</form>
