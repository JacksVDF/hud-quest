<script lang="ts">
	import ComplexityPicker from './ComplexityPicker.svelte';
	import TagInput from './TagInput.svelte';
	import type { Complexity } from '#lib/xp.ts';

	let { onadd }: { onadd: (title: string, complexity: Complexity, tags: string[]) => void } =
		$props();

	let title = $state('');
	let complexity = $state<Complexity>('easy');
	let tags = $state<string[]>([]);

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!title.trim()) return;
		onadd(title, complexity, tags);
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
	<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div class="sm:max-w-sm sm:flex-1">
			<TagInput bind:tags />
		</div>
		<button type="submit" class="btn g self-start sm:self-auto" disabled={!title.trim()}>
			ADD &gt;
		</button>
	</div>
</form>
