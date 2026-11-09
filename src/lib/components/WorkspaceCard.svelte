<script lang="ts">
	import { resolve } from '$app/paths';
	import ProgressBar from './ProgressBar.svelte';
	import type { WorkspaceStats } from '#lib/workspaces.ts';

	let { name, routeId, stats }: { name: string; routeId: string; stats: WorkspaceStats } = $props();
</script>

<a
	href={resolve('/w/[id]', { id: routeId })}
	class="brk flex h-full flex-col gap-3 p-4 transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 motion-reduce:transition-none"
	data-testid="workspace-card"
	aria-label="Open {name}: {stats.open} open, {stats.done} done"
>
	<span class="h text-xl break-words">{name}</span>
	<span class="text-xs">{stats.open} open · {stats.done} done</span>
	<ProgressBar value={stats.done} max={stats.total} label="{name} progress" compact />
</a>
