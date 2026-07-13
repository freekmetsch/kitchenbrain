<!--
	Meta chips: only what's set gets shown — no "At a glance" label, no "Unset"
	tiles (show, don't tell). Tags ride the same row. Notes render as a soft
	panel underneath. Renders nothing when the recipe has no metadata at all.
-->
<script lang="ts">
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { Recipe } from './types';

	let {
		recipe,
		displayCategory,
		displayCuisine,
		displayNotes
	}: {
		recipe: Recipe;
		displayCategory: string | null;
		displayCuisine: string | null;
		displayNotes: string | null;
	} = $props();

	function stars(rating: number): string {
		return `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`;
	}
</script>

{#if recipe.servings || recipe.totalTimeMin || recipe.rating || displayCuisine || displayCategory || recipe.tags.length || displayNotes}
	<section class="mx-3 mt-3 flex flex-col gap-2">
		<div class="flex flex-wrap items-center gap-1.5">
			{#if recipe.servings}
				<span class="ui-chip-muted">{m.recipes_meta_servings({ count: recipe.servings })}</span>
			{/if}
			{#if recipe.totalTimeMin}
				<span class="ui-chip-muted"><Icon name="clock" class="h-3 w-3" />{recipe.totalTimeMin} min</span>
			{/if}
			{#if recipe.rating}
				<span class="ui-chip-muted"><span class="text-warning">{stars(recipe.rating)}</span></span>
			{/if}
			{#if displayCuisine ?? displayCategory}
				<span class="ui-chip-muted">{displayCuisine ?? displayCategory}</span>
			{/if}
			{#each recipe.tags as tag}
				<span class="ui-chip-muted">{tag}</span>
			{/each}
		</div>
		{#if displayNotes}
			<p class="rounded-xl bg-base-200/50 px-3 py-2 text-sm leading-snug text-base-content/75">
				{displayNotes}
			</p>
		{/if}
	</section>
{/if}
