<!--
	Manual link picker (UX-STOCK-2). Suggestions only cover title matches;
	harira/hachee-style meals with no matching title need a search-all-recipes
	path or linking is a dead end. The page owns the search text so it resets on
	every open, exactly as before.
-->
<script lang="ts">
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import type { Item, RecipeOption } from './shared';

	let {
		open = $bindable(false),
		item,
		search = $bindable(),
		options,
		onPick
	}: {
		open?: boolean;
		item: Item | null;
		search: string;
		options: RecipeOption[];
		onPick: (option: RecipeOption) => void;
	} = $props();

	const linkOptions = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return q ? options.filter((o) => o.title.toLowerCase().includes(q)) : options;
	});
</script>

<BottomSheet bind:open title={item ? `Link a recipe to ${item.name}` : 'Link a recipe'}>
	<input
		type="search"
		class="input input-bordered input-sm mb-2 w-full"
		placeholder="Search recipes…"
		bind:value={search}
	/>
	{#if linkOptions.length === 0}
		<p class="py-6 text-center text-sm text-base-content/60">No recipes match "{search}".</p>
	{:else}
		<ul class="divide-y divide-base-200">
			{#each linkOptions as option (option.slug)}
				<li>
					<button
						type="button"
						class="w-full px-1 py-2.5 text-left text-sm hover:bg-base-200"
						onclick={() => onPick(option)}>{option.title}</button
					>
				</li>
			{/each}
		</ul>
	{/if}
</BottomSheet>
