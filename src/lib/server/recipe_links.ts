// Recipe ingredient-role and food-class derivation (Phase 4, ADR 0001).
//
// AH-INVARIANT: every name this module emits toward shopping/AH is the Dutch
// `recipes.ingredients[].name`; English recipe fields (titleEn, ingredientsEn)
// are display-only and never feed matching or the shopping list.
import * as schema from '$lib/server/db/schema';
import type { Ingredient } from '$lib/server/db/schema';
import type { Db as DB } from '$lib/server/db/types';
import { inferFoodClassFromName, normalizeFoodClass } from '$lib/food_class';
import { expandMealIngredients, type SubRecipeRef } from '$lib/server/meal_recipes';

type Recipe = typeof schema.recipes.$inferSelect;

export type IngredientRoleCoverage = {
	total: number;
	classified: number;
	unknownNames: string[];
	complete: boolean;
};

/** Exact role coverage for the expanded Dutch ingredient list. */
export function ingredientRoleCoverage(ingredients: Ingredient[]): IngredientRoleCoverage {
	const relevant = ingredients.filter((ingredient) => ingredient.name.trim().length > 0);
	const unknownNames = relevant
		.filter((ingredient) => ingredient.role !== 'cook_in' && ingredient.role !== 'serve_fresh')
		.map((ingredient) => ingredient.name);
	return {
		total: relevant.length,
		classified: relevant.length - unknownNames.length,
		unknownNames,
		complete: relevant.length > 0 && unknownNames.length === 0
	};
}

export function expandedIngredientRoleCoverage(
	db: DB,
	recipe: { id: number; ingredients: unknown },
	subRecipes?: SubRecipeRef[]
): IngredientRoleCoverage {
	return ingredientRoleCoverage(expandMealIngredients(db, recipe, subRecipes));
}

/**
 * Derive a food-class slug for a recipe: prefer its `category` when that maps
 * to a known class, else infer from the first ingredient name that resolves.
 * Recipes have no facet column (ADR 0001 facets are inventory-only), so this
 * derivation powers the P4.5 rolling-up Food Class filter without a migration.
 */
export function recipeFoodClass(recipe: Pick<Recipe, 'category' | 'ingredients'>): string | null {
	const fromCategory = normalizeFoodClass(recipe.category);
	if (fromCategory) return fromCategory;
	const ings = (recipe.ingredients as Ingredient[]) ?? [];
	for (const ing of ings) {
		const inferred = inferFoodClassFromName(ing.name);
		if (inferred) return inferred;
	}
	return null;
}
