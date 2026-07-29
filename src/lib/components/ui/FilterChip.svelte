<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	let {
		selected = false,
		tone = 'default',
		disabled = false,
		class: klass = '',
		children,
		...rest
	}: {
		selected?: boolean;
		tone?: 'default' | 'success' | 'warning' | 'info';
		class?: string;
		children: Snippet;
	} & HTMLButtonAttributes = $props();
</script>

<button
	{...rest}
	type="button"
	class="ui-filter-chip-hit {klass}"
	data-house-style="filter-chip"
	data-tone={tone}
	aria-pressed={selected}
	{disabled}
>
	<span class:ui-filter-chip-visual-selected={selected} class="ui-filter-chip-visual">
		{@render children()}
	</span>
</button>
