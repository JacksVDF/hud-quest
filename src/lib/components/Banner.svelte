<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { ms } from '#lib/motion.ts';

	/** Seconds the message stays before it closes by itself. */
	const BANNER_SECONDS = 6;

	let { message, onclose }: { message: string; onclose: () => void } = $props();

	let left = $state(BANNER_SECONDS);
	// Hovering or focusing the banner pauses the countdown so it can be read or clicked.
	let paused = $state(false);

	$effect(() => {
		if (paused) return;
		const timer = setInterval(() => {
			left -= 1;
			if (left <= 0) onclose();
		}, 1000);
		return () => clearInterval(timer);
	});
</script>

<p
	in:fly|global={{ y: -10, duration: ms(220) }}
	out:fade|global={{ duration: ms(150) }}
	onmouseenter={() => (paused = true)}
	onmouseleave={() => (paused = false)}
	onfocusin={() => (paused = true)}
	onfocusout={() => (paused = false)}
	class="col-start-1 row-start-1 flex items-center justify-between gap-3 p-3 text-sm {message.startsWith(
		'[✓]'
	)
		? 'bg-f text-b'
		: 'border-2 border-f'} {message.includes('LEVEL UP') ? 'gline pb-4' : ''}"
>
	<span>{message}</span>
	<button
		type="button"
		class="flex min-h-9 items-center gap-2 px-1 font-bold"
		onclick={onclose}
		aria-label="Dismiss"
		title={paused ? 'Paused' : `Closes in ${left}s`}
	>
		<span class="text-xs font-normal" data-testid="banner-countdown"
			>{paused ? '||' : `${left}s`}</span
		>
		<span>[X]</span>
	</button>
</p>
