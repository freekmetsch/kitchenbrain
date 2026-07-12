// P4.3 — "serve this from the freezer". Computes the deterministic serve-fresh
// completion list (serve_fresh ingredients − current stock) and pushes it onto
// the week's shopping list as manual overrides.
//
// AH-INVARIANT: the names written here are the Dutch recipes.ingredients[].name.
// This writes only to our own shopping_list_overrides table — it does NOT push
// to Albert Heijn (that stays the separate, explicit "Send to AH" action).
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { recipes, inventoryItems, shoppingListOverrides } from '$lib/server/db/schema';
import { serveFreshForRecipe } from '$lib/server/recipe_links';
import { isoWeekStart } from '$lib/week';

const BodySchema = z.object({
	weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	let body: unknown = {};
	try {
		body = await request.json();
	} catch {
		/* empty body is fine — defaults to the current week */
	}
	const parsed = BodySchema.safeParse(body);
	if (!parsed.success) throw error(400, parsed.error.message);
	// isoWeekStart() also normalizes an off-Monday date to that week's Monday.
	const weekStart = isoWeekStart(parsed.data.weekStart);

	const recipe = db.select().from(recipes).where(eq(recipes.slug, params.slug)).get();
	if (!recipe) throw error(404, 'Recipe not found');

	const stockNames = db
		.select({ name: inventoryItems.name })
		.from(inventoryItems)
		.where(isNull(inventoryItems.deletedAt))
		.all()
		.map((r) => r.name);

	const fresh = serveFreshForRecipe(db, recipe, stockNames);

	const now = new Date();
	let added = 0;
	for (const item of fresh) {
		const res = db
			.insert(shoppingListOverrides)
			.values({
				weekStartDate: weekStart,
				name: item.name,
				amount: item.amount,
				unit: item.unit,
				manual: true,
				bought: false,
				createdAt: now
			})
			.onConflictDoNothing()
			.run();
		added += res.changes;
	}

	return json({ ok: true, week: weekStart, items: fresh, added });
};
