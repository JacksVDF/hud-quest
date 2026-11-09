<script lang="ts">
	import { MAX_WORKSPACE_NAME } from '#lib/workspaces.ts';

	let {
		onadd,
		disabled = false
	}: {
		/** Returns an error to show under the field, or '' when the workspace was created. */
		onadd: (name: string) => string;
		disabled?: boolean;
	} = $props();

	let name = $state('');
	let error = $state('');

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (disabled || !name.trim()) return;
		error = onadd(name);
		if (!error) name = '';
	}
</script>

<form class="flex flex-col gap-2" onsubmit={submit}>
	<div class="flex flex-col gap-3 sm:flex-row sm:items-end">
		<label class="flex-1 text-xs">
			NEW_WORKSPACE_
			<input
				class="inp mt-1"
				bind:value={name}
				oninput={() => (error = '')}
				placeholder="e.g. Home"
				maxlength={MAX_WORKSPACE_NAME}
				required
			/>
		</label>
		<button type="submit" class="btn g self-start sm:self-auto" disabled={disabled || !name.trim()}>
			CREATE &gt;
		</button>
	</div>
	<p class="min-h-5 text-xs" role="status">
		{#if error}[!] {error}{/if}
	</p>
</form>
