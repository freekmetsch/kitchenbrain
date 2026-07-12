import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { recipes, inventoryItems } from '$lib/server/db/schema';
import type { Ingredient } from '$lib/server/db/schema';
import { namesMatch } from '$lib/match';
import { frozenPortionsByRecipe, serveFreshForRecipe } from '$lib/server/recipe_links';
import { mealsContaining, subRecipesOf } from '$lib/server/meal_recipes';
import { offsetIsoWeek, isoWeekNumber, isoWeekStart } from '$lib/week';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { recipeLang } = await parent();
	const recipe = db.select().from(recipes).where(eq(recipes.slug, params.slug)).get();
	if (!recipe) throw error(404, 'Recipe not found');

	const currentWeekStart = isoWeekStart();
	const nextWeekStart = offsetIsoWeek(currentWeekStart, 1);
	const weeks = [
		{ weekStartDate: currentWeekStart, weekNumber: isoWeekNumber(currentWeekStart), label: 'This week' },
		{ weekStartDate: nextWeekStart, weekNumber: isoWeekNumber(nextWeekStart), label: 'Next week' }
	];

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

	// P4.3 recipe → stock direction: frozen portions of this recipe's leftover on
	// hand + the deterministic serve-fresh completion list (fresh − stock, Dutch).
	const frozenPortions = frozenPortionsByRecipe(db).get(recipe.id) ?? 0;
	const serveFresh = serveFreshForRecipe(db, recipe, stockNames, subRecipes);
	const hasRoles = ings.some((i) => i.role === 'serve_fresh' || i.role === 'cook_in');

	return {
		recipe,
		weeks,
		recipeLang,
		ingredientStock,
		frozenPortions,
		serveFresh,
		hasRoles,
		currentWeekStart,
		subRecipes,
		partOfMeals
	};
};
