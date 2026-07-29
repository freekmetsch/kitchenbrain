<script lang="ts">
	import { base } from '$app/paths';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';

	type MealRef = { dinner: string; recipeSlug: string };
	let {
		mealsWithoutRecipe,
		freezerMeals,
		freezerMealsMissingFreshInfo
	}: {
		mealsWithoutRecipe: string[];
		freezerMeals: MealRef[];
		freezerMealsMissingFreshInfo: MealRef[];
	} = $props();

	let noticeCount = $derived(
		Number(mealsWithoutRecipe.length > 0) +
		Number(freezerMeals.length > 0) +
		Number(freezerMealsMissingFreshInfo.length > 0)
	);
	let hasWarning = $derived(mealsWithoutRecipe.length > 0 || freezerMealsMissingFreshInfo.length > 0);
</script>

{#if noticeCount > 0}
	<details class="market-notices">
		<summary>
			<Icon name="warn" class="h-4 w-4 shrink-0 {hasWarning ? 'text-warning' : 'text-info'}" />
			<span class="flex-1 font-medium">{m.shopping_notes_heading()}</span>
			<span class="market-notice-count">{noticeCount}</span>
			<span aria-hidden="true" class="text-base-content/50">⌄</span>
		</summary>
		<ul class="divide-y divide-base-200 border-t border-base-200 text-sm">
			{#if mealsWithoutRecipe.length}
				<li class="px-3 py-2.5 text-base-content/70">
					<p class="font-medium text-base-content/80">{m.shopping_without_recipe_heading()}</p>
					<div class="mt-1 flex flex-wrap gap-1">
						{#each mealsWithoutRecipe as meal}<span class="ui-chip-muted min-h-7 py-1">{meal}</span>{/each}
					</div>
				</li>
			{/if}
			{#if freezerMeals.length}
				<li class="px-3 py-2.5 text-base-content/70">
					<p>{m.shopping_freezer_meals_summary()}</p>
					<div class="mt-1 flex flex-wrap gap-1">
						{#each freezerMeals as meal}<span class="ui-chip-muted min-h-7 py-1">❄️ {meal.dinner}</span>{/each}
					</div>
				</li>
			{/if}
			{#if freezerMealsMissingFreshInfo.length}
				<li class="px-3 py-2.5 text-base-content/70">
					<p>{m.shopping_freezer_missing_roles_banner()}</p>
					<div class="mt-1.5 flex flex-wrap gap-1">
						{#each freezerMealsMissingFreshInfo as meal}
							<a href="{base}/recipes/{meal.recipeSlug}" class="ui-chip min-h-7 py-1 text-primary">{meal.dinner}</a>
						{/each}
					</div>
				</li>
			{/if}
		</ul>
	</details>
{/if}

<style>
	.market-notices {
		overflow: hidden;
		margin-bottom: 0.55rem;
		border: 1px solid color-mix(in oklab, var(--color-warning) 42%, var(--color-base-300));
		border-radius: 0.75rem;
		background: color-mix(in oklab, var(--color-warning) 8%, var(--color-base-100));
		color: color-mix(in oklab, var(--color-warning) 55%, var(--color-base-content));
	}

	.market-notices summary {
		display: flex;
		min-height: 2.75rem;
		cursor: pointer;
		list-style: none;
		align-items: center;
		gap: 0.55rem;
		padding: 0 0.7rem;
		font-size: 0.72rem;
	}

	.market-notices summary::-webkit-details-marker {
		display: none;
	}

	.market-notice-count {
		display: inline-grid;
		min-width: 1.35rem;
		height: 1.35rem;
		place-items: center;
		border-radius: 999px;
		background: color-mix(in oklab, var(--color-warning) 14%, var(--color-base-100));
		font-size: 0.62rem;
		font-weight: 800;
	}

	.market-notices :global(a) {
		min-height: 2.75rem;
	}
</style>
