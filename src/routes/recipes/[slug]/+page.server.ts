import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { recipes, inventoryItems, mealPlanMeals } from '$lib/server/db/schema';
import type { Ingredient } from '$lib/server/db/schema';
import { namesMatch } from '$lib/match';
import {
	expandedIngredientRoleCoverage,
	frozenPortionsByRecipe
} from '$lib/server/recipe_links';
import { expandMealIngredientsForServings, mealsContaining, subRecipesOf } from '$lib/server/meal_recipes';
import { getMealPlanPrefs } from '$lib/server/meal_plan/prefs';
import { addDays, isoWeekNumber, todayIso, weekStartFor } from '$lib/week';

export const load: PageServerLoad = async ({ params, parent, url }) => {
	const { recipeLang } = await parent();
	const recipe = db.select().from(recipes).where(eq(recipes.slug, params.slug)).get();
	if (!recipe) throw error(404, 'Recipe not found');

	// Same planning window as the meal plan itself (Settings → Meal planning):
	// custom week-start day, as many weeks ahead as the household plans. Labels
	// are derived client-side (locale-aware).
	const prefs = getMealPlanPrefs();
	const currentWeekStart = weekStartFor(todayIso(), prefs.weekStartDay);
	const weeks = Array.from({ length: Math.max(2, prefs.planAheadWeeks) }, (_, i) => {
		const weekStartDate = addDays(currentWeekStart, i * 7);
		return { weekStartDate, weekNumber: isoWeekNumber(weekStartDate) };
	});

	// AH-INVARIANT: stock match + the serve-fresh list use Dutch ingredient names
	// (recipe.ingredients), never the English cache.
	const stockRows = db
		.select({ name: inventoryItems.name })
		.from(inventoryItems)
		.where(isNull(inventoryItems.deletedAt))
		.all();
	const stockNames = stockRows.map((s) => s.name);
	const ings = recipe.ingredients as Ingredient[];
	const ingredientStock: boolean[] = ings.map((ing) => stockNames.some((n) => namesMatch(ing.name, n)));

	// Meal Recipe composition (ADR 0003): sub-recipes for the Combines section
	// and freeze attribution; parent meals for the "Part of" line. serveFresh
	// runs over the EXPANDED ingredient set (via serveFreshForRecipe) so a
	// planned meal completes fresh items for every component.
	const subRecipes = subRecipesOf(db, recipe.id);
	const partOfMeals = mealsContaining(db, recipe.id);

	// P4.3 recipe → stock direction: frozen portions of this recipe's leftover
	// on hand.
	const frozenPortions = frozenPortionsByRecipe(db).get(recipe.id) ?? 0;
	const roleCoverage = expandedIngredientRoleCoverage(db, recipe, subRecipes);
	const cookingIngredients = expandMealIngredientsForServings(db, recipe, recipe.servings, subRecipes);
	const cookingIngredientStock = cookingIngredients.map((ingredient) => stockNames.some((name) => namesMatch(ingredient.name, name)));
	const planId = Number(url.searchParams.get('plan'));
	const plannedMeal = Number.isInteger(planId) && planId > 0
		? db.select().from(mealPlanMeals).where(eq(mealPlanMeals.id, planId)).get()
		: null;
	const linkedPlan = plannedMeal?.recipeSlug === recipe.slug ? plannedMeal : null;
	const requestedServings = Number(url.searchParams.get('servings'));
	const directServings = Number.isInteger(requestedServings) && requestedServings >= 1 && requestedServings <= 99
		? requestedServings
		: null;

	return {
		recipe,
		weeks,
		recipeLang,
		ingredientStock,
		frozenPortions,
		roleCoverage,
		subRecipes,
		partOfMeals,
		occasionServings: linkedPlan?.servings ?? directServings ?? recipe.servings,
		planMealId: linkedPlan?.id ?? null,
		cookingIngredients,
		cookingIngredientStock
	};
};
