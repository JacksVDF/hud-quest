<script lang="ts">
	let {
		value,
		max,
		label,
		compact = false
	}: { value: number; max: number; label: string; compact?: boolean } = $props();

	const pct = $derived(max > 0 ? Math.min(100, (value / max) * 100) : 0);
</script>

<div
	class="border-2 border-f p-0.5 {compact ? 'h-4' : 'h-6'}"
	role="progressbar"
	aria-label={label}
	aria-valuemin={0}
	aria-valuemax={max}
	aria-valuenow={value}
>
	<div
		class="bar h-full transition-[width] duration-300 motion-reduce:transition-none"
		style:width="{pct}%"
	></div>
</div>

<style>
	.bar {
		background: repeating-linear-gradient(90deg, var(--f) 0 8px, transparent 8px 12px);
	}
</style>
