<!-- Compact recipe context: servings, timing, and the recipe summary. -->
<script lang="ts">
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { Recipe } from './types';

	let {
		recipe,
		displayNotes
	}: {
		recipe: Recipe;
		displayNotes: string | null;
	} = $props();
</script>

{#if recipe.servings || recipe.totalTimeMin || displayNotes}
	<section
		class="mx-3 mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-base-200 bg-base-100 px-3 py-2.5 text-[13px] text-base-content/75"
	>
		{#if recipe.servings}
			<span class="inline-flex items-center gap-1.5">
				<Icon name="cutlery" class="h-3.5 w-3.5 text-base-content/45" />
				{m.recipes_meta_servings({ count: recipe.servings })}
			</span>
		{/if}
		{#if recipe.totalTimeMin}
			<span class="inline-flex items-center gap-1.5">
				<Icon name="clock" class="h-3.5 w-3.5 text-base-content/45" />
				{recipe.totalTimeMin} min
			</span>
		{/if}
		{#if displayNotes}
			<p class="basis-full border-t border-base-200 pt-2 text-sm leading-snug text-base-content/70">{displayNotes}</p>
		{/if}
	</section>
{/if}
