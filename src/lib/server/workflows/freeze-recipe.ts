import type { Db } from '$lib/server/db/types';
import { db as appDb } from '$lib/server/db/index';
import {
	addInventory,
	type AddInventoryResult,
	type WriteCtx
} from '$lib/server/domains/inventory/commands';
import { getRecipeBySlug } from '$lib/server/domains/recipes';

export type FreezeRecipeInput = {
	slug: string;
	portions: number;
};

export type FreezeRecipeResult = Pick<AddInventoryResult, 'item' | 'action'>;

export function freezeRecipe(
	db: Db,
	input: FreezeRecipeInput,
	ctx: WriteCtx
): FreezeRecipeResult | undefined {
	return db.transaction((tx) => {
		const recipe = getRecipeBySlug(tx, input.slug);
		if (!recipe) return undefined;

		const result = addInventory(
			tx,
			{
				name: recipe.title,
				section: 'freezer',
				kind: 'leftover',
				qtyNum: input.portions,
				unit: 'portion',
				madeFromRecipeId: recipe.id,
				recipeStatus: 'linked'
			},
			ctx
		);

		return { item: result.item, action: result.action };
	});
}

export function freezeRecipeForApp(input: FreezeRecipeInput, ctx: WriteCtx) {
	return freezeRecipe(appDb, input, ctx);
}
