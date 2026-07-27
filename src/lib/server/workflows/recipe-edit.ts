import { db as appDb } from '$lib/server/db/index';
import {
	getRecipeBySlug,
	updateCanonicalRecipe,
	type CanonicalRecipeUpdate
} from '$lib/server/domains/recipes';
import { reconcileShoppingAfterWrite } from '$lib/server/workflows/reconcile-shopping';

export function getRecipeForEdit(slug: string) {
	return getRecipeBySlug(appDb, slug);
}

export function saveRecipeEdit(input: {
	recipeId: number;
	expectedRevision: number;
	changes: CanonicalRecipeUpdate;
	reconcileShopping: boolean;
}) {
	return appDb.transaction((tx) => {
		const updated = updateCanonicalRecipe(tx, input);
		if (updated && input.reconcileShopping) {
			reconcileShoppingAfterWrite(tx);
		}
		return updated;
	});
}
