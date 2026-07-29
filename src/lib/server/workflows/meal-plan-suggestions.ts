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

function mealOptionScore(recipe: {
	ingredient_count: number;
	inventory_overlap: number;
	stale_on_hand: string[];
	frozen_portions_on_hand: number;
	days_since_cooked: number | null;
	rating: number | null;
	total_time_min: number | null;
}, repeatCycleDays: number): number {
	const coverage =
		recipe.ingredient_count > 0
			? recipe.inventory_overlap / recipe.ingredient_count
			: 0;
	const repeatPenalty =
		recipe.days_since_cooked != null &&
		repeatCycleDays > 0 &&
		recipe.days_since_cooked < repeatCycleDays
			? 45
			: 0;
	const timeScore =
		recipe.frozen_portions_on_hand > 0
			? 20
			: recipe.total_time_min == null
				? 0
				: recipe.total_time_min <= 20
					? 15
					: recipe.total_time_min <= 35
						? 8
						: 0;
	return (
		recipe.frozen_portions_on_hand * 50 +
		coverage * 35 +
		recipe.stale_on_hand.length * 18 +
		(recipe.rating ?? 0) * 3 +
		Math.min(recipe.days_since_cooked ?? 0, 120) / 8 +
		timeScore -
		repeatPenalty
	);
}

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
		const staleOnHand = matched
			.filter((ingredient) =>
				staleInventory.some((item) => namesMatch(ingredient.name, item.name))
			)
			.map((ingredient) => ingredient.name);
		return {
			slug: recipe.slug,
			title: recipe.title,
			category: recipe.category,
			rating: recipe.rating,
			servings: recipe.servings,
			total_time_min: recipe.totalTimeMin,
			ingredient_count: ingredients.length,
			inventory_overlap: matched.length,
			on_hand: matched.map((ingredient) => ingredient.name),
			stale_on_hand: staleOnHand,
			missing_items: ingredients
				.filter(
					(ingredient) =>
						!matched.some((candidate) => candidate.id === ingredient.id)
				)
				.map((ingredient) => ingredient.name),
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
	const comparable = recipesWithOverlap
		.map((recipe) => {
			const source =
				recipe.frozen_portions_on_hand > 0 ? ('freezer' as const) : ('fresh' as const);
			const why: string[] = [];
			if (source === 'freezer') {
				why.push(`${recipe.frozen_portions_on_hand} freezer portions are ready`);
			}
			if (recipe.inventory_overlap > 0) {
				why.push(
					`${recipe.inventory_overlap} of ${recipe.ingredient_count} ingredients are on hand`
				);
			}
			if (recipe.stale_on_hand.length > 0) {
				why.push(`${recipe.stale_on_hand.join(', ')} have been in stock for at least 30 days`);
			}
			if (recipe.total_time_min != null) {
				why.push(`${recipe.total_time_min} minutes listed cook time`);
			}
			if (
				recipe.days_since_cooked != null &&
				recipe.days_since_cooked >= prefs.repeatCycleDays
			) {
				why.push(`${recipe.days_since_cooked} days since last cooked`);
			}
			if (why.length === 0) why.push('Available in the saved recipe catalog');
			return {
				slug: recipe.slug,
				title: recipe.title,
				source,
				servings: recipe.servings ?? 4,
				total_time_min: recipe.total_time_min,
				on_hand: recipe.on_hand,
				stale_on_hand: recipe.stale_on_hand,
				missing_items:
					source === 'freezer'
						? (recipe.fresh_sides_if_from_freezer ?? [])
						: recipe.missing_items,
				frozen_portions_on_hand: recipe.frozen_portions_on_hand,
				days_since_cooked: recipe.days_since_cooked,
				why,
				freezer_effect:
					source === 'freezer'
						? `Uses ${Math.min(recipe.servings ?? 4, recipe.frozen_portions_on_hand)} ready freezer portions`
						: recipe.frozen_portions_on_hand > 0
							? `Leaves ${recipe.frozen_portions_on_hand} freezer portions untouched`
							: 'Does not change freezer portions',
				score: mealOptionScore(recipe, prefs.repeatCycleDays)
			};
		})
		.sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
		.slice(0, 3);
	const defaultOption = comparable[0] ?? null;
	const materialUncertainty =
		defaultOption?.source === 'freezer' &&
		recipesWithOverlap.find((recipe) => recipe.slug === defaultOption.slug)
			?.fresh_sides_if_from_freezer === null
			? 'The recipe has no explicit fresh-side role data.'
			: defaultOption?.missing_items.length
				? `Stock coverage is incomplete: ${defaultOption.missing_items.join(', ')}.`
				: comparable.length < 3
					? 'Fewer than three saved recipes are available for comparison.'
					: null;
	const recommendation = defaultOption
		? {
				why_now:
					'This is the strongest current fit across readiness, stock coverage, age pressure, time, and repeat rotation.',
				evidence: defaultOption.why,
				confidence:
					comparable.length >= 3 && materialUncertainty === null
						? ('high' as const)
						: materialUncertainty
							? ('medium' as const)
							: ('low' as const),
				uncertainty: materialUncertainty,
				consequence:
					defaultOption.source === 'freezer'
						? `Uses one frozen portion of ${defaultOption.title}; only known fresh sides still need Shopping.`
						: `Cooks ${defaultOption.title} fresh; missing ingredients remain for Shopping.`,
				default: defaultOption,
				alternatives: comparable.slice(1)
			}
		: null;
	return {
		inventory: inventoryWithAge,
		stale_inventory: staleInventory,
		recent_meals: recentMeals,
		recipes: recipesWithOverlap,
		requested_count: input.count ?? prefs.suggestCount,
		repeat_cycle_days: prefs.repeatCycleDays,
		avoid_recipes_cooked_recently: avoidRepeats,
		recommendation,
		target_week:
			input.weekStartDate ?? weekStartFor(todayIso(), prefs.weekStartDay)
	};
}
