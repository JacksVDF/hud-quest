<script lang="ts">
	import { REPEATS, type Repeat } from '#lib/dates.ts';

	/** The deadline and repeat inputs shared by the new-task form and the edit form. */
	let {
		dueDate = $bindable(''),
		repeat = $bindable('')
	}: { dueDate: string; repeat: Repeat | '' } = $props();

	const LABELS: Record<Repeat, string> = {
		daily: 'EVERY DAY',
		weekly: 'EVERY WEEK',
		monthly: 'EVERY MONTH'
	};

	// A repeat needs a date to repeat from, so clearing the date clears the repeat.
	$effect(() => {
		if (!dueDate) repeat = '';
	});
</script>

<div class="flex flex-col gap-3 sm:flex-row sm:items-start">
	<label class="text-xs sm:w-44">
		DUE_
		<input class="inp mt-1" type="date" bind:value={dueDate} data-testid="due-date" />
	</label>
	<label class="text-xs sm:w-44">
		REPEAT_
		<select class="inp mt-1" bind:value={repeat} disabled={!dueDate} data-testid="repeat">
			<option value="">NEVER</option>
			{#each REPEATS as r (r)}
				<option value={r}>{LABELS[r]}</option>
			{/each}
		</select>
	</label>
</div>
