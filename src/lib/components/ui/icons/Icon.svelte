<script lang="ts">
	import { ICONS, type IconName } from './paths';

	let { name, class: cls = 'h-4 w-4' }: { name: IconName; class?: string } = $props();

	const icon = $derived(ICONS[name]);
</script>

<svg
	viewBox={icon.viewBox}
	class={cls}
	fill="none"
	stroke="currentColor"
	stroke-width={icon.sw}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#each icon.paths as d}
		<path {d} />
	{/each}
</svg>
