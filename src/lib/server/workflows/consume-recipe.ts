import type { Db } from '$lib/server/db/types';
import { db as appDb } from '$lib/server/db/index';
import {
	removeInventory,
	updateInventory,
	type WriteCtx
} from '$lib/server/domains/inventory/commands';
import { listInventory } from '$lib/server/domains/inventory/queries';
import { getRecipeBySlug } from '$lib/server/domains/recipes';

export type ConsumeRecipeInput = {
	slug: string;
	portions: number;
};

export type ConsumeRecipeResult = {
	ok: true;
	consumed: number;
	remaining: number;
};

export class RecipeInventoryMutationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'RecipeInventoryMutationError';
	}
}

export function consumeRecipe(
	db: Db,
	input: ConsumeRecipeInput,
	ctx: WriteCtx
): ConsumeRecipeResult | undefined {
	return db.transaction((tx) => {
		const recipe = getRecipeBySlug(tx, input.slug);
		if (!recipe) return undefined;

		const leftovers = listInventory(tx, { section: 'freezer', sort: 'oldest_added' })
			.filter(
				(item) =>
					item.kind === 'leftover' &&
					item.madeFromRecipeId === recipe.id &&
					item.qtyNum !== null
			)
			.sort(
				(a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id
			);

		let toConsume = input.portions;
		let consumed = 0;
		for (const item of leftovers) {
			if (toConsume <= 0) break;
			const available = item.qtyNum ?? 0;
			if (available <= 0) continue;
			const take = Math.min(available, toConsume);
			const result =
				take >= available
					? removeInventory(tx, { id: item.id }, ctx)
					: updateInventory(tx, item.id, { qtyNum: available - take }, ctx);
			if (!result.ok) throw new RecipeInventoryMutationError(result.error);
			toConsume -= take;
			consumed += take;
		}

		const totalAvailable = leftovers.reduce((sum, item) => sum + (item.qtyNum ?? 0), 0);
		return {
			ok: true,
			consumed,
			remaining: Math.max(0, totalAvailable - consumed)
		};
	});
}

export function consumeRecipeForApp(input: ConsumeRecipeInput, ctx: WriteCtx) {
	return consumeRecipe(appDb, input, ctx);
}
