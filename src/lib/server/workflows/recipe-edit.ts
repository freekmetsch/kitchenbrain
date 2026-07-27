import { db as appDb } from '$lib/server/db/index';
import type { Db } from '$lib/server/db/types';
import {
	getRecipeBySlug,
	updateCanonicalRecipe,
	type CanonicalRecipeUpdate
} from '$lib/server/domains/recipes';
import { reconcileShoppingAfterWrite } from '$lib/server/shopping_entries';

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
			reconcileShoppingAfterWrite(tx as unknown as Db);
		}
		return updated;
	});
}
