import type { Db } from '$lib/server/db/types';
import { frozenPortionsByRecipe } from '$lib/server/domains/inventory/freezer';
import { listInventorySuggestionRows } from '$lib/server/domains/inventory/queries';
import { listRecentMealLog } from '$lib/server/domains/meal-plan/queries';
import { listRecipeSuggestionCandidates } from '$lib/server/domains/recipes';
import { dateInputValue, daysSinceDate } from '$lib/inventory_dates';
import { namesMatch } from '$lib/match';
import type { Ingredient } from '$lib/recipe_ingredient';
import { getMealPlanPrefs } from '$lib/server/meal_plan/prefs';
import { todayIso, weekStartFor } from '$lib/week';

export function getMealSuggestionContext(
	db: Db,
	input: { weekStartDate?: string; count?: number }
) {
	const inventory = listInventorySuggestionRows(db);
	const inventoryWithAge = inventory.map((item) => ({
		...item,
		added_date: dateInputValue(item.createdAt),
		days_in_inventory: daysSinceDate(item.createdAt)
	}));
	const staleInventory = inventoryWithAge
		.filter((item) => (item.days_in_inventory ?? 0) >= 30)
		.sort((left, right) => (right.days_in_inventory ?? 0) - (left.days_in_inventory ?? 0))
		.slice(0, 20);
	const recentMeals = listRecentMealLog(db);
	const recipeList = listRecipeSuggestionCandidates(db);
	const frozenPortions = frozenPortionsByRecipe(db);
	const now = Date.now();
	const recipesWithOverlap = recipeList.map((recipe) => {
		const ingredients = (recipe.ingredients as Ingredient[]) ?? [];
		const matched = ingredients.filter((ingredient) =>
			inventory.some((item) => namesMatch(ingredient.name, item.name))
		);
		const lastCookedMs =
			recipe.lastCookedAt instanceof Date ? recipe.lastCookedAt.getTime() : null;
		const roles = ingredients.filter((ingredient) => ingredient.role === 'serve_fresh');
		const hasRoles = ingredients.some(
			(ingredient) =>
				ingredient.role === 'cook_in' || ingredient.role === 'serve_fresh'
		);
		const frozen = frozenPortions.get(recipe.id) ?? 0;
		return {
			slug: recipe.slug,
			title: recipe.title,
			category: recipe.category,
			rating: recipe.rating,
			ingredient_count: ingredients.length,
			inventory_overlap: matched.length,
			on_hand: matched.map((ingredient) => ingredient.name),
			frozen_portions_on_hand: frozen,
			fresh_sides_if_from_freezer:
				frozen > 0 ? (hasRoles ? roles.map((ingredient) => ingredient.name) : null) : undefined,
			cooked_count: recipe.cookedCount ?? 0,
			days_since_cooked: lastCookedMs
				? Math.floor((now - lastCookedMs) / 86_400_000)
				: null,
			last_cooked_date: lastCookedMs
				? new Date(lastCookedMs).toISOString().slice(0, 10)
				: null
		};
	});
	const prefs = getMealPlanPrefs(db);
	const avoidRepeats =
		prefs.repeatCycleDays > 0
			? recipesWithOverlap
					.filter(
						(recipe) =>
							recipe.days_since_cooked != null &&
							recipe.days_since_cooked < prefs.repeatCycleDays
					)
					.map((recipe) => recipe.title)
			: [];
	return {
		inventory: inventoryWithAge,
		stale_inventory: staleInventory,
		recent_meals: recentMeals,
		recipes: recipesWithOverlap,
		requested_count: input.count ?? prefs.suggestCount,
		repeat_cycle_days: prefs.repeatCycleDays,
		avoid_recipes_cooked_recently: avoidRepeats,
		target_week:
			input.weekStartDate ?? weekStartFor(todayIso(), prefs.weekStartDay)
	};
}
