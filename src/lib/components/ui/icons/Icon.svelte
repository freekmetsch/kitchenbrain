<script lang="ts">
	import { toPathDef, type IconName } from './paths';
	import { ICON_SETS, type IconSetId } from './sets';
	import { iconSet } from './active.svelte';

	// `set` pins a specific set (the /design/icons shotgun grid uses it);
	// everywhere else omits it and follows the app-wide active set.
	let {
		name,
		class: cls = 'h-4 w-4',
		set
	}: { name: IconName; class?: string; set?: IconSetId } = $props();

	const icon = $derived((set ? ICON_SETS[set].icons : iconSet.icons)[name]);
	const cap = $derived(icon.cap ?? 'round');
</script>

<svg
	viewBox={icon.viewBox}
	class={cls}
	fill="none"
	stroke-width={icon.sw}
	stroke-linecap={cap}
	stroke-linejoin={cap === 'round' ? 'round' : 'miter'}
	aria-hidden="true"
>
	{#each icon.paths as p}
		{@const pd = toPathDef(p)}
		<path
			d={pd.d}
			fill={pd.fill ? 'currentColor' : 'none'}
			fill-rule="evenodd"
			stroke={pd.fill ? 'none' : 'currentColor'}
			stroke-width={pd.sw}
			opacity={pd.opacity}
		/>
	{/each}
</svg>
