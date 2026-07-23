<script lang="ts">
	import { scaleAmount as scaleIngredientAmount } from '$lib/recipe_scale';
	import { m } from '$lib/paraglide/messages';
	import { parseRecipeSource } from '$lib/recipe_source';

	type Ingredient = { name: string; amount: string; unit?: string };

	type Props = {
		directions: string[];
		ingredients: Ingredient[];
		ingredientStock: boolean[];
		viewLang: 'en' | 'nl';
		servings: number | null;
		targetServings: number;
		sourceUrl?: string | null;
	};

	let {
		directions,
		ingredients,
		ingredientStock,
		viewLang,
		servings,
		targetServings,
		sourceUrl
	}: Props = $props();

	let servingsMultiplier = $derived(targetServings / (servings ?? 4));
	let source = $derived(parseRecipeSource(sourceUrl));

	function scaleAmount(amount: string, name: string): string {
		return scaleIngredientAmount(amount, name, servingsMultiplier);
	}
</script>

<div class="px-3 pt-3 pb-32">
	{#if source}
		<p class="mb-4 text-xs text-base-content/60">
			{m.recipes_source_label()}
			<a
				href={source.href}
				target="_blank"
				rel="noopener noreferrer"
				class="font-medium text-base-content underline underline-offset-2">{source.host} ↗</a
			>
		</p>
	{/if}

	{#if ingredients.length > 0}
		<h2 class="text-base font-semibold mb-2">
			{viewLang === 'en' ? 'Ingredients' : 'Ingrediënten'}
		</h2>
		<ul class="space-y-1.5 mb-5">
			{#each ingredients as ingredient, index}
				<li class="flex items-baseline gap-2 text-sm">
					<span class="font-medium text-primary tabular-nums min-w-[5rem] text-right shrink-0">
						{scaleAmount(ingredient.amount, ingredient.name)}{ingredient.unit ? ` ${ingredient.unit}` : ''}
					</span>
					<span class="flex-1">{ingredient.name}</span>
					{#if ingredientStock[index]}
						<span class="badge badge-xs badge-success shrink-0" title={m.recipes_fallback_in_stock_title()}>
							{m.recipes_fallback_in_stock_badge()}
						</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if directions.length > 0}
		<h2 class="text-base font-semibold mb-2">
			{viewLang === 'en' ? 'Directions' : 'Bereiding'}
		</h2>
		<ol class="space-y-4 mb-5">
			{#each directions as direction, index}
				<li class="flex gap-3">
					<span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-content">
						{index + 1}
					</span>
					<p class="min-w-0 flex-1 text-sm leading-relaxed">{direction}</p>
				</li>
			{/each}
		</ol>
	{/if}
</div>
