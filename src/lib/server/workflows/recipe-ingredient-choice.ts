import { db as appDb } from '$lib/server/db/index';
import { saveRecipeIngredientDefault } from '$lib/server/shopping_recipe_choice';

export function saveRecipeIngredientChoice(input: {
	recipeSlug: string;
	ingredientId: string;
	substituteIndex: number;
	expectedRecipeRevision: number;
}) {
	return saveRecipeIngredientDefault(appDb, input);
}
