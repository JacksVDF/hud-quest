import { cubicIn } from 'svelte/easing';
import { slide, type TransitionConfig } from 'svelte/transition';

/** Transition duration in ms; 0 when the user prefers reduced motion (or during SSR). */
export function ms(duration: number): number {
	if (typeof matchMedia === 'undefined') return 0;
	return matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration;
}

/** Delete animation: the element flies sideways while it fades out and collapses its height. */
export function dismiss(
	node: Element,
	{ duration = 300, x = 48 }: { duration?: number; x?: number } = {}
): TransitionConfig {
	const collapse = slide(node, { duration });
	return {
		duration,
		easing: cubicIn,
		css: (t, u) =>
			`${collapse.css?.(t, u) ?? ''}; transform: translateX(${u * x}px); opacity: ${t};`
	};
}
