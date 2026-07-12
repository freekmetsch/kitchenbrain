// P4.1 — freeze-from-cook. Creates a leftover inventory item linked to the
// recipe it was cooked from (kind=leftover, unit=portion). Merges into an
// existing linked leftover of the same recipe (portions sum) via the mutation
// boundary, so freezing twice adds up rather than duplicating.
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { recipes } from '$lib/server/db/schema';
import { addInventory } from '$lib/server/inventory_writes';

const FreezeSchema = z.object({
	portions: z.number().int().positive().max(99)
});

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = FreezeSchema.safeParse(body);
	if (!parsed.success) throw error(400, parsed.error.message);

	const recipe = db.select().from(recipes).where(eq(recipes.slug, params.slug)).get();
	if (!recipe) throw error(404, 'Recipe not found');

	const result = addInventory(
		db,
		{
			// Store the recipe's canonical title; the leftover's English display
			// resolves through the recipe link, so the stored name stays canonical.
			name: recipe.title,
			section: 'freezer',
			kind: 'leftover',
			qtyNum: parsed.data.portions,
			unit: 'portion',
			madeFromRecipeId: recipe.id,
			recipeStatus: 'linked'
		},
		{ actor: locals.user.username, userId: locals.user.id }
	);

	return json({ item: result.item, action: result.action });
};
