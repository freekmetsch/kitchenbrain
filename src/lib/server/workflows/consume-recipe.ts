import type { Db, DbOrTx } from '$lib/server/db/types';
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

export type ConsumeRecipeTransactionResult = ConsumeRecipeResult & {
	opIds: number[];
};

export class RecipeInventoryMutationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'RecipeInventoryMutationError';
	}
}

export function consumeRecipeInTransaction(
	db: DbOrTx,
	input: ConsumeRecipeInput,
	ctx: WriteCtx
): ConsumeRecipeTransactionResult | undefined {
	const recipe = getRecipeBySlug(db, input.slug);
	if (!recipe) return undefined;

	const leftovers = listInventory(db, { section: 'freezer', sort: 'oldest_added' })
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
	const opIds: number[] = [];
	for (const item of leftovers) {
		if (toConsume <= 0) break;
		const available = item.qtyNum ?? 0;
		if (available <= 0) continue;
		const take = Math.min(available, toConsume);
		const result =
			take >= available
				? removeInventory(db, { id: item.id }, ctx)
				: updateInventory(db, item.id, { qtyNum: available - take }, ctx);
		if (!result.ok) throw new RecipeInventoryMutationError(result.error);
		if (result.opId !== null) opIds.push(result.opId);
		toConsume -= take;
		consumed += take;
	}

	const totalAvailable = leftovers.reduce((sum, item) => sum + (item.qtyNum ?? 0), 0);
	return {
		ok: true,
		consumed,
		remaining: Math.max(0, totalAvailable - consumed),
		opIds
	};
}

export function consumeRecipe(
	db: Db,
	input: ConsumeRecipeInput,
	ctx: WriteCtx
): ConsumeRecipeResult | undefined {
	return db.transaction((tx) => {
		const result = consumeRecipeInTransaction(tx, input, ctx);
		if (!result) return undefined;
		return {
			ok: result.ok,
			consumed: result.consumed,
			remaining: result.remaining
		};
	});
}

export function consumeRecipeForApp(input: ConsumeRecipeInput, ctx: WriteCtx) {
	return consumeRecipe(appDb, input, ctx);
}
