<script lang="ts">
	import { onMount } from 'svelte';

	let theme = $state<'light' | 'dark'>('light');

	onMount(() => {
		theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
	});

	function toggle() {
		theme = theme === 'light' ? 'dark' : 'light';
		document.documentElement.dataset.theme = theme;
		localStorage.setItem('hud-quest-todo:theme', theme);
	}
</script>

<button type="button" class="btn o sm" onclick={toggle} aria-label="Toggle light/dark theme">
	THEME:{theme === 'light' ? 'LIGHT' : 'DARK'}
</button>
