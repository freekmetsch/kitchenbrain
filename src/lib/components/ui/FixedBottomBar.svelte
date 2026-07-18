<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import { registerFixedSurface } from '$lib/fixed_surfaces';

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
			? 'bottom: var(--ui-nav-offset)'
			: 'bottom: 0; padding-bottom: env(safe-area-inset-bottom, 0px)'
	);

	let barEl: HTMLElement;
	onMount(() => registerFixedSurface(barEl));
</script>

<div
	bind:this={barEl}
	class="ui-z-sheet fixed inset-x-0 border-t border-base-300 bg-base-100/95 backdrop-blur"
	{style}
>
	<div class={contentClass}>
		{@render children()}
	</div>
</div>
