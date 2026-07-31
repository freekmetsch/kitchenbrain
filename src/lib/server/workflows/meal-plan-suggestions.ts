import type { Db } from '$lib/server/db/types';
import { frozenPortionsByRecipe } from '$lib/server/domains/inventory/freezer';
import { listInventorySuggestionRows } from '$lib/server/domains/inventory/queries';
import { listMealPlanMeals, listRecentMealLog } from '$lib/server/domains/meal-plan/queries';
import { listRecipeSuggestionCandidates } from '$lib/server/domains/recipes';
import { dateInputValue, daysSinceDate } from '$lib/inventory_dates';
import { namesMatch } from '$lib/match';
import type { Ingredient } from '$lib/recipe_ingredient';
import { getWeekStartDay } from '$lib/server/meal_plan/prefs';
import { todayIso, weekStartFor } from '$lib/week';
import { evaluateRotation } from '$lib/meal_rotation';
import { projectRotationSource } from '$lib/meal_rotation_source';

function mealOptionScore(recipe: {
	ingredient_count: number;
	inventory_overlap: number;
	stale_on_hand: string[];
	frozen_portions_on_hand: number;
	rating: number | null;
	total_time_min: number | null;
	rotation_status: string;
}): number {
	const coverage = recipe.ingredient_count > 0 ? recipe.inventory_overlap / recipe.ingredient_count : 0;
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
	const rotationScore = recipe.rotation_status === 'due' ? 120 : recipe.rotation_status === 'unconfigured' ? -5 : 0;
	return (
		rotationScore +
		recipe.frozen_portions_on_hand * 50 +
		coverage * 35 +
		recipe.stale_on_hand.length * 18 +
		(recipe.rating ?? 0) * 3 +
		timeScore
	);
}

export function getMealSuggestionContext(db: Db, input: { weekStartDate?: string; count?: number }) {
	const weekStartDay = getWeekStartDay(db);
	const targetWeek = weekStartFor(input.weekStartDate ?? todayIso(), weekStartDay);
	const currentWeek = weekStartFor(todayIso(), weekStartDay);
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
	const reservedBySlug = new Map<string, string[]>();
	for (const meal of listMealPlanMeals(db)) {
		if (meal.status !== 'planned' || !meal.recipeSlug) continue;
		reservedBySlug.set(meal.recipeSlug, [
			...(reservedBySlug.get(meal.recipeSlug) ?? []),
			meal.weekStartDate
		]);
	}

	const recipesWithOverlap = recipeList
		.map((recipe) => {
			const ingredients = (recipe.ingredients as Ingredient[]) ?? [];
			const matched = ingredients.filter((ingredient) =>
				inventory.some((item) => namesMatch(ingredient.name, item.name))
			);
			const frozen = frozenPortions.get(recipe.id) ?? 0;
			const roles = ingredients.filter((ingredient) => ingredient.role === 'serve_fresh');
			const hasRoles = ingredients.some(
				(ingredient) => ingredient.role === 'cook_in' || ingredient.role === 'serve_fresh'
			);
			const staleOnHand = matched
				.filter((ingredient) => staleInventory.some((item) => namesMatch(ingredient.name, item.name)))
				.map((ingredient) => ingredient.name);
			const rotation = evaluateRotation({
				policy: recipe.rotationPolicy,
				seasons: recipe.rotationSeasonsJson,
				lastCookedAt: recipe.lastCookedAt,
				targetWeekStart: targetWeek,
				currentWeekStart: currentWeek,
				reservedWeekStarts: reservedBySlug.get(recipe.slug) ?? []
			});
			const source = projectRotationSource({
				isFreezerStaple: recipe.isFreezerStaple,
				targetPortions: recipe.targetPortions,
				onHandPortions: frozen,
				servings: recipe.servings
			});
			return {
				slug: recipe.slug,
				title: recipe.title,
				category: recipe.category,
				rating: recipe.rating,
				total_time_min: recipe.totalTimeMin,
				ingredient_count: ingredients.length,
				inventory_overlap: matched.length,
				on_hand: matched.map((ingredient) => ingredient.name),
				stale_on_hand: staleOnHand,
				missing_items: ingredients
					.filter((ingredient) => !matched.some((candidate) => candidate.id === ingredient.id))
					.map((ingredient) => ingredient.name),
				frozen_portions_on_hand: frozen,
				fresh_sides_if_from_freezer: frozen > 0 ? (hasRoles ? roles.map((ingredient) => ingredient.name) : null) : undefined,
				cooked_count: recipe.cookedCount ?? 0,
				last_cooked_date: recipe.lastCookedAt ? dateInputValue(recipe.lastCookedAt) : null,
				rotation_policy: recipe.rotationPolicy,
				rotation_seasons: recipe.rotationSeasonsJson,
				rotation_status:
					rotation.status === 'excluded' && rotation.reason.code === 'unconfigured'
						? 'unconfigured'
						: rotation.status,
				rotation_reason: rotation.reason,
				recommended_action: source.action,
				recommended_source: source.mealSource,
				recommended_servings: source.servings
			};
		})
		.filter((recipe) => recipe.rotation_policy !== 'never' && recipe.rotation_policy !== 'special');

	const comparable = recipesWithOverlap
		.map((recipe) => {
			const why: string[] = [];
			if (recipe.rotation_status === 'due') why.push('Due in the household recipe rhythm');
			if (recipe.recommended_source === 'freezer') why.push(`${recipe.frozen_portions_on_hand} freezer portions are ready`);
			if (recipe.inventory_overlap > 0) why.push(`${recipe.inventory_overlap} of ${recipe.ingredient_count} ingredients are on hand`);
			if (recipe.stale_on_hand.length > 0) why.push(`${recipe.stale_on_hand.join(', ')} have been in stock for at least 30 days`);
			if (recipe.total_time_min != null) why.push(`${recipe.total_time_min} minutes listed cook time`);
			if (why.length === 0) why.push('Available in the saved recipe catalog');
			return {
				...recipe,
				source: recipe.recommended_source,
				missing_items:
					recipe.recommended_source === 'freezer'
						? (recipe.fresh_sides_if_from_freezer ?? [])
						: recipe.missing_items,
				why,
				score: mealOptionScore(recipe)
			};
		})
		.sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
		.slice(0, 3);
	const defaultOption = comparable[0] ?? null;
	const materialUncertainty =
		defaultOption?.source === 'freezer' && defaultOption.fresh_sides_if_from_freezer === null
			? 'The recipe has no explicit fresh-side role data.'
			: defaultOption?.missing_items.length
				? `Stock coverage is incomplete: ${defaultOption.missing_items.join(', ')}.`
				: comparable.length < 3
					? 'Fewer than three saved recipes are available for comparison.'
					: null;
	const recommendation = defaultOption
		? {
				why_now: 'This is the strongest current fit across recipe rhythm, freezer readiness, stock coverage, age pressure, and time.',
				evidence: defaultOption.why,
				confidence: comparable.length >= 3 && materialUncertainty === null ? ('high' as const) : materialUncertainty ? ('medium' as const) : ('low' as const),
				uncertainty: materialUncertainty,
				consequence:
					defaultOption.source === 'freezer'
						? `Uses frozen portions of ${defaultOption.title}; only known fresh sides still need Shopping.`
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
		requested_count: input.count ?? 3,
		recommendation,
		target_week: targetWeek
	};
}
