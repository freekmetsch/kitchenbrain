// Manage a Meal Recipe's sub-recipe links: add or remove one link per call.
// Used by the "Combines" section on the meal's recipe page.
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { recipes } from '$lib/server/db/schema';
import { kickCookModeGeneration } from '$lib/server/ai/cook_mode';
import {
	addSubRecipe,
	removeSubRecipe,
	subRecipesOf,
	MealCompositionError
} from '$lib/server/meal_recipes';

const PatchSchema = z
	.object({
		add_slug: z.string().min(1).optional(),
		remove_slug: z.string().min(1).optional()
	})
	.refine((d) => (d.add_slug ? 1 : 0) + (d.remove_slug ? 1 : 0) === 1, {
		message: 'Provide exactly one of add_slug or remove_slug'
	});

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const meal = db.select({ id: recipes.id }).from(recipes).where(eq(recipes.slug, params.slug)).get();
	if (!meal) throw error(404, 'Recipe not found');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = PatchSchema.safeParse(body);
	if (!parsed.success) throw error(400, parsed.error.message);

	const targetSlug = parsed.data.add_slug ?? parsed.data.remove_slug!;
	const target = db.select({ id: recipes.id }).from(recipes).where(eq(recipes.slug, targetSlug)).get();
	if (!target) throw error(404, 'Sub-recipe not found');

	try {
		if (parsed.data.add_slug) addSubRecipe(db, meal.id, target.id);
		else removeSubRecipe(db, meal.id, target.id);
	} catch (e) {
		if (e instanceof MealCompositionError) throw error(422, e.message);
		throw e;
	}

	// Composition changes invalidate the meal's combined bench sheet. Clearing
	// the cache is what actually invalidates — generateCookMode's staleness
	// check only compares sub-recipe updatedAt, not the meal's own. Then
	// pre-generate so the sheet is ready by the next open.
	db.update(recipes)
		.set({ updatedAt: new Date(), cookModeJson: null, cookModeGeneratedAt: null })
		.where(eq(recipes.id, meal.id))
		.run();
	kickCookModeGeneration(params.slug);

	return json({ subRecipes: subRecipesOf(db, meal.id) });
};
