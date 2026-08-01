import { db as appDb } from '$lib/server/db/index';
import { getUserPref } from '$lib/server/db/user_prefs';
import { getMealPlanPrefs } from '$lib/server/meal_plan/prefs';
import {
	getMealPlanMeal,
	listRecipeMealOccurrences
} from '$lib/server/domains/meal-plan/queries';
import {
	expandedIngredientRoleCoverage,
	expandMealIngredientsForServings,
	getRecipeBySlug,
	getRecipesByIds,
	listArchivedRecipes,
	listRecipes,
	mealsContaining,
	recipeFoodClass,
	subRecipeCountByMeal,
	subRecipesOf
} from '$lib/server/domains/recipes';
import { frozenPortionsByRecipe } from '$lib/server/domains/inventory/freezer';
import { listActiveInventoryNames } from '$lib/server/domains/inventory/queries';
import { foodCategoryMatches } from '$lib/food_categories';
import { rollsUpTo } from '$lib/food_class';
import { namesMatch } from '$lib/match';
import { projectIngredient } from '$lib/recipe_scale';
import {
	type Ingredient,
	translatedIngredientComplete,
	translatedIngredientDisplay
} from '$lib/recipe_ingredient';
import { addDays, isoWeekNumber, todayIso, weekStartFor } from '$lib/week';

const DISH_TYPES = [
	'soup',
	'salad',
	'pasta',
	'pizza',
	'dessert',
	'breakfast',
	'side',
	'sauce',
	'snack'
];

export function loadRecipeListData(input: {
	url: URL;
	recipeLang: string;
	userId?: number;
}) {
	const query = input.url.searchParams.get('q') ?? '';
	const urlSort = input.url.searchParams.get('sort');
	let sortBy = urlSort ?? 'title';
	if (!urlSort && input.userId != null) {
		const stored = getUserPref(appDb, input.userId, 'recipe_default_sort');
		if (stored) sortBy = stored;
	}
	const classFilter = input.url.searchParams.get('class') ?? '';
	const dishFilter = input.url.searchParams.get('dish') ?? '';
	const ingredientFilter = input.url.searchParams.get('ingredient') ?? '';
	const haveAll = input.url.searchParams.get('have') === '1';
	const freezerOnly = input.url.searchParams.get('freezer') === '1';
	const belowTargetOnly = input.url.searchParams.get('below') === '1';
	const rotationOnly = input.url.searchParams.get('rotation') === '1';
	const archivedOnly = input.url.searchParams.get('archived') === '1';

	const stockNames = listActiveInventoryNames(appDb);
	const frozenByRecipe = frozenPortionsByRecipe(appDb);
	const subCounts = subRecipeCountByMeal(appDb);
	const prefs = getMealPlanPrefs();
	const currentWeekStart = weekStartFor(todayIso(), prefs.weekStartDay);
	const weeks = Array.from({ length: Math.max(2, prefs.planAheadWeeks) }, (_, index) => {
		const weekStartDate = addDays(currentWeekStart, index * 7);
		return { weekStartDate, weekNumber: isoWeekNumber(weekStartDate) };
	});

	let enriched = (archivedOnly ? listArchivedRecipes(appDb) : listRecipes(appDb)).map((recipe) => {
			const ingredients = recipe.ingredients as Ingredient[];
			const total = ingredients.length;
			const covered = ingredients.filter((ingredient) =>
				stockNames.some((name) => namesMatch(ingredient.name, name))
			).length;
			const onHand = frozenByRecipe.get(recipe.id) ?? 0;
			return {
				...recipe,
				subCount: subCounts.get(recipe.id) ?? 0,
				foodClass: recipeFoodClass(recipe),
				coverage: covered,
				ingredientTotal: total,
				hasAllIngredients: total > 0 && covered === total,
				onHandPortions: onHand,
				belowTarget:
					recipe.isFreezerStaple &&
					recipe.targetPortions != null &&
					onHand < recipe.targetPortions
			};
		});

	if (query) {
		const normalized = query.toLowerCase();
		enriched = enriched.filter(
			(recipe) =>
				recipe.title.toLowerCase().includes(normalized) ||
				(recipe.titleEn?.toLowerCase().includes(normalized) ?? false) ||
				(recipe.ingredientsEn?.some((ingredient) =>
					ingredient.name.toLowerCase().includes(normalized)
				) ??
					false) ||
				(recipe.ingredients as Ingredient[]).some((ingredient) =>
					ingredient.name?.toLowerCase().includes(normalized)
				)
		);
	}
	if (classFilter) {
		enriched = enriched.filter((recipe) => rollsUpTo(recipe.foodClass, classFilter));
	}
	if (dishFilter) {
		enriched = enriched.filter(
			(recipe) =>
				foodCategoryMatches(recipe.category, dishFilter) ||
				foodCategoryMatches(recipe.categoryEn, dishFilter)
		);
	}
	if (ingredientFilter) {
		enriched = enriched.filter((recipe) =>
			(recipe.ingredients as Ingredient[]).some((ingredient) =>
				namesMatch(ingredient.name, ingredientFilter)
			)
		);
	}
	if (haveAll) enriched = enriched.filter((recipe) => recipe.hasAllIngredients);
	if (freezerOnly) enriched = enriched.filter((recipe) => recipe.isFreezerStaple);
	if (belowTargetOnly) enriched = enriched.filter((recipe) => recipe.belowTarget);
	if (rotationOnly) {
		enriched = enriched.filter(
			(recipe) => recipe.rotationPolicy !== null && recipe.rotationPolicy !== 'never'
		);
	}

	if (sortBy === 'rating') {
		enriched.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
	} else if (sortBy === 'recent') {
		enriched.sort(
			(a, b) =>
				(b.lastCookedAt instanceof Date ? b.lastCookedAt.getTime() : 0) -
				(a.lastCookedAt instanceof Date ? a.lastCookedAt.getTime() : 0)
		);
	} else if (sortBy === 'neglected') {
		enriched.sort(
			(a, b) =>
				(a.lastCookedAt instanceof Date ? a.lastCookedAt.getTime() : 0) -
				(b.lastCookedAt instanceof Date ? b.lastCookedAt.getTime() : 0)
		);
	} else if (sortBy === 'most-cooked') {
		enriched.sort((a, b) => (b.cookedCount ?? 0) - (a.cookedCount ?? 0));
	} else {
		enriched.sort((a, b) => {
			const aTitle = input.recipeLang === 'en' ? (a.titleEn ?? a.title) : a.title;
			const bTitle = input.recipeLang === 'en' ? (b.titleEn ?? b.title) : b.title;
			return aTitle.localeCompare(bTitle, input.recipeLang === 'en' ? 'en' : 'nl');
		});
	}

	return {
		recipes: enriched,
		query,
		sortBy,
		classFilter,
		dishFilter,
		ingredientFilter,
		toggles: { haveAll, freezerOnly, belowTargetOnly, rotationOnly, archivedOnly },
		dishTypes: DISH_TYPES,
		recipeLang: input.recipeLang,
		weeks
	};
}

export function loadRecipeDetailData(slug: string, input: { recipeLang: string; url: URL }) {
	const recipe = getRecipeBySlug(appDb, slug);
	if (!recipe) return null;
	const prefs = getMealPlanPrefs();
	const currentWeekStart = weekStartFor(todayIso(), prefs.weekStartDay);
	const weeks = Array.from({ length: Math.max(2, prefs.planAheadWeeks) }, (_, index) => {
		const weekStartDate = addDays(currentWeekStart, index * 7);
		return { weekStartDate, weekNumber: isoWeekNumber(weekStartDate) };
	});
	const stockNames = listActiveInventoryNames(appDb);
	const ingredients = recipe.ingredients as Ingredient[];
	const ingredientStock = ingredients.map((ingredient) =>
		stockNames.some((name) => namesMatch(ingredient.name, name))
	);
	const subRecipes = subRecipesOf(appDb, recipe.id);
	const partOfMeals = mealsContaining(appDb, recipe.id);
	const frozenPortions = frozenPortionsByRecipe(appDb).get(recipe.id) ?? 0;
	const roleCoverage = expandedIngredientRoleCoverage(appDb, recipe, subRecipes);
	const cookingIngredients = expandMealIngredientsForServings(
		appDb,
		recipe,
		recipe.servings,
		subRecipes
	);
	const componentIds = [recipe.id, ...subRecipes.map((subRecipe) => subRecipe.id)];
	const componentRows = getRecipesByIds(appDb, componentIds);
	const componentById = new Map(componentRows.map((row) => [row.id, row]));
	const orderedComponents = componentIds
		.map((id) => componentById.get(id))
		.filter((row): row is NonNullable<typeof row> => row != null);
	const translatedComponents = orderedComponents.map((row) => {
		const source = row.ingredients as Ingredient[];
		if (row.language === 'en') return source;
		if (row.ingredientsEn?.length !== source.length) return null;
		if (
			!source.every((ingredient, index) =>
				translatedIngredientComplete(ingredient, row.ingredientsEn?.[index])
			)
		) {
			return null;
		}
		return source.map((ingredient, index) =>
			translatedIngredientDisplay(ingredient, row.ingredientsEn![index])
		);
	});
	const cookingIngredientsEn = translatedComponents.some((component) => component == null)
		? null
		: orderedComponents.flatMap((row, componentIndex) =>
				translatedComponents[componentIndex]!.map((ingredient) =>
					projectIngredient(ingredient, row.servings, recipe.servings)
				)
			);
	const cookingIngredientStock = cookingIngredients.map((ingredient) =>
		stockNames.some((name) => namesMatch(ingredient.name, name))
	);
	const cookingDirections = orderedComponents.flatMap((row) => row.directions);
	const cookingDirectionIds = orderedComponents.flatMap((row) => row.directionIdsJson);
	const cookingDirectionsEn = orderedComponents.every(
		(row) => row.language === 'en' || row.directionsEn?.length === row.directions.length
	)
		? orderedComponents.flatMap((row) =>
				row.language === 'en' ? row.directions : (row.directionsEn ?? row.directions)
			)
		: null;
	const planId = Number(input.url.searchParams.get('plan'));
	const plannedMeal =
		Number.isInteger(planId) && planId > 0
			? getMealPlanMeal(appDb, planId)
			: null;
	const linkedPlan = plannedMeal?.recipeSlug === recipe.slug ? plannedMeal : null;
	const currentAndFutureOccurrences = listRecipeMealOccurrences(appDb, recipe.slug, currentWeekStart);
	const plannedOccurrences = (
		linkedPlan && !currentAndFutureOccurrences.some((meal) => meal.id === linkedPlan.id)
			? [linkedPlan, ...currentAndFutureOccurrences]
			: currentAndFutureOccurrences
	).map((meal) => ({ ...meal, servings: meal.servings ?? recipe.servings }));
	const planMealEditable =
		linkedPlan != null &&
		linkedPlan.weekStartDate >= currentWeekStart &&
		linkedPlan.status === 'planned';
	const requestedServings = Number(input.url.searchParams.get('servings'));
	const directServings =
		Number.isInteger(requestedServings) && requestedServings >= 1 && requestedServings <= 99
			? requestedServings
			: null;

	return {
		recipe,
		weeks,
		recipeLang: input.recipeLang,
		ingredientStock,
		frozenPortions,
		roleCoverage,
		subRecipes,
		partOfMeals,
		occasionServings: linkedPlan?.servings ?? directServings ?? recipe.servings,
		planMealId: linkedPlan?.id ?? null,
		planMealEditable,
		plannedOccurrences,
		cookingIngredients,
		cookingIngredientsEn,
		cookingIngredientStock,
		cookingDirections,
		cookingDirectionsEn,
		cookingDirectionIds
	};
}
