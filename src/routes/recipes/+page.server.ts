import type { PageServerLoad } from './$types';
import { isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { recipes, inventoryItems } from '$lib/server/db/schema';
import { getUserPref } from '$lib/server/db/user_prefs';
import type { Ingredient } from '$lib/server/db/schema';
import { foodCategoryMatches } from '$lib/food_categories';
import { rollsUpTo } from '$lib/food_class';
import { namesMatch } from '$lib/match';
import { frozenPortionsByRecipe, recipeFoodClass } from '$lib/server/recipe_links';
import { subRecipeCountByMeal } from '$lib/server/meal_recipes';
import { getMealPlanPrefs } from '$lib/server/meal_plan/prefs';
import { addDays, isoWeekNumber, todayIso, weekStartFor } from '$lib/week';

// Dish types are the non-food-class half of the legacy category vocabulary
// (P4.5): Food Class (meat/fish/veg…) is a separate, rolling-up axis now.
const DISH_TYPES = ['soup', 'salad', 'pasta', 'pizza', 'dessert', 'breakfast', 'side', 'sauce', 'snack'];

export const load: PageServerLoad = async ({ url, parent, locals }) => {
	const query = url.searchParams.get('q') ?? '';
	const urlSort = url.searchParams.get('sort');
	// Persisted default only applies when the URL carries no ?sort= — bookmarks
	// and the back button must keep overriding it (Phase 4 Correctness Req #3).
	let sortBy = urlSort ?? 'title';
	if (!urlSort && locals.user) {
		const stored = getUserPref(db, locals.user.id, 'recipe_default_sort');
		if (stored) sortBy = stored;
	}
	const classFilter = url.searchParams.get('class') ?? '';
	const dishFilter = url.searchParams.get('dish') ?? '';
	const ingredientFilter = url.searchParams.get('ingredient') ?? '';
	const haveAll = url.searchParams.get('have') === '1';
	const freezerOnly = url.searchParams.get('freezer') === '1';
	const belowTargetOnly = url.searchParams.get('below') === '1';
	const quickOnly = url.searchParams.get('quick') === '1';
	const { recipeLang } = await parent();

	const stockNames = db
		.select({ name: inventoryItems.name })
		.from(inventoryItems)
		.where(isNull(inventoryItems.deletedAt))
		.all()
		.map((r) => r.name);
	const frozenByRecipe = frozenPortionsByRecipe(db);
	const subCounts = subRecipeCountByMeal(db);
	const prefs = getMealPlanPrefs();
	const currentWeekStart = weekStartFor(todayIso(), prefs.weekStartDay);
	const weeks = Array.from({ length: Math.max(2, prefs.planAheadWeeks) }, (_, index) => {
		const weekStartDate = addDays(currentWeekStart, index * 7);
		return { weekStartDate, weekNumber: isoWeekNumber(weekStartDate) };
	});

	// Enrich each recipe with the derived facet axes the filters + cards read.
	let enriched = db
		.select()
		.from(recipes)
		.all()
		.map((r) => {
			const ings = r.ingredients as Ingredient[];
			const total = ings.length;
			const covered = ings.filter((ing) => stockNames.some((n) => namesMatch(ing.name, n))).length;
			const onHand = frozenByRecipe.get(r.id) ?? 0;
			return {
				...r,
				subCount: subCounts.get(r.id) ?? 0,
				foodClass: recipeFoodClass(r),
				coverage: covered,
				ingredientTotal: total,
				hasAllIngredients: total > 0 && covered === total,
				onHandPortions: onHand,
				belowTarget:
					r.isFreezerStaple && r.targetPortions != null && onHand < r.targetPortions
			};
		});

	if (query) {
		const q = query.toLowerCase();
		enriched = enriched.filter(
			(r) =>
				r.title.toLowerCase().includes(q) ||
				(r.titleEn?.toLowerCase().includes(q) ?? false) ||
				(r.ingredientsEn?.some((i) => i.name.toLowerCase().includes(q)) ?? false) ||
				(r.ingredients as Ingredient[]).some((i) => i.name?.toLowerCase().includes(q))
		);
	}

	if (classFilter) {
		enriched = enriched.filter((r) => rollsUpTo(r.foodClass, classFilter));
	}

	if (dishFilter) {
		enriched = enriched.filter(
			(r) => foodCategoryMatches(r.category, dishFilter) || foodCategoryMatches(r.categoryEn, dishFilter)
		);
	}

	if (ingredientFilter) {
		enriched = enriched.filter((r) =>
			(r.ingredients as Ingredient[]).some((i) => namesMatch(i.name, ingredientFilter))
		);
	}

	if (haveAll) enriched = enriched.filter((r) => r.hasAllIngredients);
	if (freezerOnly) enriched = enriched.filter((r) => r.isFreezerStaple);
	if (belowTargetOnly) enriched = enriched.filter((r) => r.belowTarget);
	if (quickOnly) enriched = enriched.filter((r) => r.totalTimeMin != null && r.totalTimeMin <= 30);

	if (sortBy === 'rating') {
		enriched.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
	} else if (sortBy === 'recent') {
		enriched.sort((a, b) => {
			const at = a.lastCookedAt instanceof Date ? a.lastCookedAt.getTime() : 0;
			const bt = b.lastCookedAt instanceof Date ? b.lastCookedAt.getTime() : 0;
			return bt - at;
		});
	} else if (sortBy === 'neglected') {
		enriched.sort((a, b) => {
			const at = a.lastCookedAt instanceof Date ? a.lastCookedAt.getTime() : 0;
			const bt = b.lastCookedAt instanceof Date ? b.lastCookedAt.getTime() : 0;
			return at - bt;
		});
	} else if (sortBy === 'most-cooked') {
		enriched.sort((a, b) => (b.cookedCount ?? 0) - (a.cookedCount ?? 0));
	} else {
		enriched.sort((a, b) => {
			const aTitle = recipeLang === 'en' ? (a.titleEn ?? a.title) : a.title;
			const bTitle = recipeLang === 'en' ? (b.titleEn ?? b.title) : b.title;
			return aTitle.localeCompare(bTitle, recipeLang === 'en' ? 'en' : 'nl');
		});
	}

	return {
		recipes: enriched,
		query,
		sortBy,
		classFilter,
		dishFilter,
		ingredientFilter,
		toggles: { haveAll, freezerOnly, belowTargetOnly, quickOnly },
		dishTypes: DISH_TYPES,
		recipeLang,
		weeks
	};
};
