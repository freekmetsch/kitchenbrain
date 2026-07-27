import { db as appDb } from '$lib/server/db/index';
import type { Db } from '$lib/server/db/types';
import {
	getRecipeBySlug,
	updateCanonicalRecipe,
	type CanonicalRecipeUpdate
} from '$lib/server/domains/recipes';
import { reconcileShoppingAfterWrite } from '$lib/server/workflows/reconcile-shopping';

type RecipeEditDependencies = {
	reconcileShopping: typeof reconcileShoppingAfterWrite;
};

const DEFAULT_DEPENDENCIES: RecipeEditDependencies = {
	reconcileShopping: reconcileShoppingAfterWrite
};

export function createRecipeEditService(
	db: Db,
	dependencies: RecipeEditDependencies = DEFAULT_DEPENDENCIES
) {
	return {
		get(slug: string) {
			return getRecipeBySlug(db, slug);
		},

		save(input: {
			recipeId: number;
			expectedRevision: number;
			changes: CanonicalRecipeUpdate;
			reconcileShopping: boolean;
		}) {
			return db.transaction((tx) => {
				const updated = updateCanonicalRecipe(tx, input);
				if (updated && input.reconcileShopping) {
					dependencies.reconcileShopping(tx);
				}
				return updated;
			});
		}
	};
}

const recipeEditService = createRecipeEditService(appDb);

export function getRecipeForEdit(slug: string) {
	return recipeEditService.get(slug);
}

export function saveRecipeEdit(input: {
	recipeId: number;
	expectedRevision: number;
	changes: CanonicalRecipeUpdate;
	reconcileShopping: boolean;
}) {
	return recipeEditService.save(input);
}
