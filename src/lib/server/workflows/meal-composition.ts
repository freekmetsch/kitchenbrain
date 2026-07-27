import type { Db } from '$lib/server/db/types';
import { db as appDb } from '$lib/server/db/index';
import {
	addSubRecipe,
	createMealRecipe,
	getRecipeBySlug,
	getRecipesBySlugs,
	listMealCandidates,
	removeSubRecipe,
	subRecipesOf,
	updateCanonicalRecipe
} from '$lib/server/domains/recipes';
import { reconcileShoppingAfterWrite } from '$lib/server/shopping_entries';
import { kickCookModeGeneration } from '$lib/server/ai/cook_mode';

export function getMealCandidates() {
	return listMealCandidates(appDb);
}

export function createMeal(input: { title: string; subRecipeSlugs: string[] }) {
	const subs = getRecipesBySlugs(appDb, input.subRecipeSlugs);
	if (subs.length !== new Set(input.subRecipeSlugs).size) return { found: false as const };
	const meal = appDb.transaction((tx) =>
		createMealRecipe(tx, { title: input.title, subRecipeIds: subs.map((recipe) => recipe.id) })
	);
	kickCookModeGeneration(meal.slug);
	return { found: true as const, meal };
}

export function changeMealComposition(input: {
	mealSlug: string;
	targetSlug: string;
	action: 'add' | 'remove';
}) {
	const result = appDb.transaction((tx) => {
		const meal = getRecipeBySlug(tx, input.mealSlug);
		if (!meal) return { status: 'meal_not_found' as const };
		const target = getRecipeBySlug(tx, input.targetSlug);
		if (!target) return { status: 'sub_not_found' as const };
		const changed =
			input.action === 'add'
				? addSubRecipe(tx, meal.id, target.id)
				: removeSubRecipe(tx, meal.id, target.id);
		if (changed) {
			const updated = updateCanonicalRecipe(tx, {
				recipeId: meal.id,
				expectedRevision: meal.contentRevision,
				changes: { cookModeJson: null, cookModeGeneratedAt: null }
			});
			if (!updated) return { status: 'stale' as const };
			reconcileShoppingAfterWrite(tx as unknown as Db);
		}
		return { status: 'ok' as const, changed, mealId: meal.id };
	});
	if (result.status === 'ok' && result.changed) kickCookModeGeneration(input.mealSlug);
	return result;
}

export function getMealComponents(mealId: number) {
	return subRecipesOf(appDb, mealId);
}
