<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		children,
		clearNav = true,
		contentClass = 'mx-auto flex max-w-2xl items-center justify-end gap-2 px-4 py-2.5'
	}: {
		children: Snippet;
		/** Sit directly above the bottom nav (default) vs flush to the viewport edge. */
		clearNav?: boolean;
		/** Layout for the bar contents; override for stacked controls. */
		contentClass?: string;
	} = $props();

	// clearNav offsets the bar up by the nav height (min-h-[3.5rem] + its own
	// safe-area padding) so Save/Cancel is visible + tappable — fixing the P1
	// where a z-30 in-flow bar painted behind the z-50 nav.
	const style = $derived(
		clearNav
			? 'bottom: calc(3.5rem + env(safe-area-inset-bottom, 0px))'
			: 'bottom: 0; padding-bottom: env(safe-area-inset-bottom, 0px)'
	);
</script>

<div
	class="ui-z-sheet fixed inset-x-0 border-t border-base-300 bg-base-100/95 backdrop-blur"
	{style}
>
	<div class={contentClass}>
		{@render children()}
	</div>
</div>
