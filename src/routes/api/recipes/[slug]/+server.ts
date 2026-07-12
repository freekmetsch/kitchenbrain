// P4.3 — recipe freezer-staple metadata. Sets is_freezer_staple + target
// portion count from the recipe page. Additive to the recipe row; does not
// touch ingredients or the AH-canonical Dutch fields.
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { recipes } from '$lib/server/db/schema';
import { setFreezerStaple } from '$lib/server/freezer_staple';

const PatchSchema = z.object({
	is_freezer_staple: z.boolean().optional(),
	target_portions: z.number().int().min(1).max(99).nullable().optional(),
	// Dismiss the "imported — please check" flag without a full edit.
	dismiss_review: z.boolean().optional()
});

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = PatchSchema.safeParse(body);
	if (!parsed.success) throw error(400, parsed.error.message);
	const input = parsed.data;

	const recipe = db.select().from(recipes).where(eq(recipes.slug, params.slug)).get();
	if (!recipe) throw error(404, 'Recipe not found');

	// Staple flag changes go through the keep-stocked seam so the opt-out memory
	// stays consistent (off records the opt-out; on clears it — UX-STOCK-14).
	if (input.is_freezer_staple !== undefined) {
		setFreezerStaple(db, recipe.id, input.is_freezer_staple, input.target_portions);
	}

	const updates: Record<string, unknown> = {};
	if (input.is_freezer_staple === undefined && input.target_portions !== undefined) {
		updates.targetPortions = input.target_portions;
	}
	if (input.dismiss_review) {
		updates.needsReview = false;
		updates.reviewReason = null;
	}
	if (Object.keys(updates).length > 0) {
		updates.updatedAt = new Date();
		db.update(recipes).set(updates).where(eq(recipes.slug, params.slug)).run();
	}

	const updated = db
		.select({
			slug: recipes.slug,
			isFreezerStaple: recipes.isFreezerStaple,
			targetPortions: recipes.targetPortions,
			needsReview: recipes.needsReview
		})
		.from(recipes)
		.where(eq(recipes.slug, params.slug))
		.get();

	return json(updated);
};
