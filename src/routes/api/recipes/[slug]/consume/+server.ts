// Serve-from-freezer consumption: eating a planned freezer meal takes N
// portions out of the leftover(s) linked to the recipe. Counterpart of
// /freeze — goes through the inventory mutation boundary so every decrement
// is logged and undoable, and a leftover that reaches 0 portions is removed
// (which re-surfaces the freezer-staple "cook again" ghost row on the stock
// page instead of leaving a dead 0-portion entry).
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { inventoryItems, recipes } from '$lib/server/db/schema';
import { removeInventory, updateInventory } from '$lib/server/inventory_writes';
import { readJsonBody } from '$lib/server/api_body';

const ConsumeSchema = z.object({
	portions: z.number().int().positive().max(99)
});

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await readJsonBody(request, ConsumeSchema);

	const recipe = db.select({ id: recipes.id }).from(recipes).where(eq(recipes.slug, params.slug)).get();
	if (!recipe) throw error(404, 'Recipe not found');

	// Oldest first — eat through the freezer in the order it was stocked.
	const leftovers = db
		.select()
		.from(inventoryItems)
		.where(
			and(
				isNull(inventoryItems.deletedAt),
				eq(inventoryItems.kind, 'leftover'),
				eq(inventoryItems.section, 'freezer'),
				eq(inventoryItems.madeFromRecipeId, recipe.id),
				isNotNull(inventoryItems.qtyNum)
			)
		)
		.orderBy(asc(inventoryItems.createdAt), asc(inventoryItems.id))
		.all();

	const ctx = { actor: locals.user.username, userId: locals.user.id };
	let toConsume = body.portions;
	let consumed = 0;
	for (const item of leftovers) {
		if (toConsume <= 0) break;
		const available = item.qtyNum ?? 0;
		if (available <= 0) continue;
		const take = Math.min(available, toConsume);
		const result =
			take >= available
				? removeInventory(db, { id: item.id }, ctx)
				: updateInventory(db, item.id, { qtyNum: available - take }, ctx);
		if (!result.ok) throw error(500, result.error);
		toConsume -= take;
		consumed += take;
	}

	const remaining = leftovers.reduce((sum, item) => sum + (item.qtyNum ?? 0), 0) - consumed;
	return json({ ok: true, consumed, remaining: Math.max(0, remaining) });
};
