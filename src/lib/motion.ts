import { cubicIn } from 'svelte/easing';
import { slide, type TransitionConfig } from 'svelte/transition';

let navigating = false;

/**
 * Set by the root layout while the app moves to another page. A "global" exit animation keeps
 * the whole old page on screen until it ends, so the old and new page would show together;
 * during a navigation every duration is 0 and the old page leaves at once.
 */
export function setNavigating(value: boolean) {
	navigating = value;
}

/** Transition duration in ms; 0 when the user prefers reduced motion, while navigating, or during SSR. */
export function ms(duration: number): number {
	if (navigating || typeof matchMedia === 'undefined') return 0;
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

/**
 * Timings shared by every animated element of the same kind, so similar things always move
 * the same way. Change a value here and all of them follow.
 */
export const MOTION = {
	/** A row or panel growing into place. */
	enter: 220,
	/** A row flying out (delete, restore). */
	exit: 320,
	/** Horizontal travel of a row that flies out, in px. */
	travel: 48
} as const;
