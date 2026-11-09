<script lang="ts">
	import { MAX_WORKSPACE_NAME } from '#lib/workspaces.ts';

	let {
		name,
		open,
		allowEdit,
		onrename,
		ondelete
	}: {
		name: string;
		/** Open (not done) tasks, shown as a count next to the name. */
		open: number;
		/** False for the INBOX, which cannot be renamed or deleted. */
		allowEdit: boolean;
		/** Returns an error to show, or '' when the name was changed. */
		onrename: (name: string) => string;
		ondelete: () => void;
	} = $props();

	let mode = $state<'view' | 'rename' | 'delete'>('view');
	let draft = $state('');
	let error = $state('');

	function startRename() {
		draft = name;
		error = '';
		mode = 'rename';
	}

	function submitRename(e: SubmitEvent) {
		e.preventDefault();
		error = onrename(draft);
		if (!error) mode = 'view';
	}
</script>

<div class="flex flex-col gap-3">
	<div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
		<h1 class="h text-4xl break-words sm:text-5xl" data-testid="workspace-name">{name}</h1>
		<span class="text-sm" data-testid="workspace-pending">{open} pending</span>
	</div>

	{#if allowEdit}
		{#if mode === 'view'}
			<div class="flex flex-wrap gap-2">
				<button type="button" class="btn o sm" onclick={startRename}>RENAME</button>
				<button type="button" class="btn o sm" onclick={() => (mode = 'delete')}>
					DELETE WORKSPACE
				</button>
			</div>
		{:else if mode === 'rename'}
			<form class="flex flex-col gap-2" onsubmit={submitRename}>
				<div class="flex flex-col gap-3 sm:flex-row sm:items-end">
					<label class="flex-1 text-xs sm:max-w-sm">
						WORKSPACE_NAME_
						<input
							class="inp mt-1"
							bind:value={draft}
							oninput={() => (error = '')}
							maxlength={MAX_WORKSPACE_NAME}
							required
						/>
					</label>
					<div class="flex gap-2">
						<button type="submit" class="btn" disabled={!draft.trim()}>SAVE</button>
						<button type="button" class="btn o" onclick={() => (mode = 'view')}>CANCEL</button>
					</div>
				</div>
				<p class="min-h-5 text-xs" role="status">
					{#if error}[!] {error}{/if}
				</p>
			</form>
		{:else}
			<div
				class="flex flex-col gap-3 border-2 border-f p-3 text-sm"
				role="alertdialog"
				aria-label="Confirm delete"
			>
				<p>
					&gt; Delete {name}? Its tasks move to the trash for 30 days and give no XP until you
					restore them.
				</p>
				<div class="flex flex-wrap gap-2">
					<button type="button" class="btn g sm" onclick={ondelete}>YES, DELETE</button>
					<button type="button" class="btn o sm" onclick={() => (mode = 'view')}>CANCEL</button>
				</div>
			</div>
		{/if}
	{/if}
</div>
