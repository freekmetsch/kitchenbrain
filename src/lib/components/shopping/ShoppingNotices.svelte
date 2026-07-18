<script lang="ts">
	import { base } from '$app/paths';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';

	type MealRef = { dinner: string; recipeSlug: string };
	let {
		showAhNotice,
		mealsWithoutRecipe,
		freezerMeals,
		freezerMealsMissingFreshInfo
	}: {
		showAhNotice: boolean;
		mealsWithoutRecipe: string[];
		freezerMeals: MealRef[];
		freezerMealsMissingFreshInfo: MealRef[];
	} = $props();

	let noticeCount = $derived(
		Number(showAhNotice) +
		Number(mealsWithoutRecipe.length > 0) +
		Number(freezerMeals.length > 0) +
		Number(freezerMealsMissingFreshInfo.length > 0)
	);
	let hasWarning = $derived(showAhNotice || mealsWithoutRecipe.length > 0 || freezerMealsMissingFreshInfo.length > 0);
</script>

{#if noticeCount > 0}
	<details class="ui-list-card mb-3">
		<summary class="flex min-h-11 cursor-pointer list-none items-center gap-2.5 px-3 text-sm">
			<Icon name="warn" class="h-4 w-4 shrink-0 {hasWarning ? 'text-warning' : 'text-info'}" />
			<span class="flex-1 font-medium">{m.shopping_notes_heading()}</span>
			<span class="badge badge-ghost badge-sm">{noticeCount}</span>
			<span aria-hidden="true" class="text-base-content/50">⌄</span>
		</summary>
		<ul class="divide-y divide-base-200 border-t border-base-200 text-sm">
			{#if showAhNotice}
				<li class="flex items-start gap-2 px-3 py-2.5">
					<span class="min-w-0 flex-1 text-base-content/70">
						{m.shopping_ah_not_connected_banner()}
					</span>
					<a href="{base}/settings/connections" class="btn btn-ghost btn-xs shrink-0">{m.shopping_connect_settings_link()}</a>
				</li>
			{/if}
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
