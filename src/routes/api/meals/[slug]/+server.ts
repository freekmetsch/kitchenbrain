// Manage a Meal Recipe's sub-recipe links: add or remove one link per call.
// Used by the "Combines" section on the meal's recipe page.
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { recipes } from '$lib/server/db/schema';
import { kickCookModeGeneration } from '$lib/server/ai/cook_mode';
import { readJsonBody } from '$lib/server/api_body';
import { updateCanonicalRecipe } from '$lib/server/recipe_mutations';
import {
	addSubRecipe,
	removeSubRecipe,
	subRecipesOf,
	MealCompositionError
} from '$lib/server/meal_recipes';
import { reconcileShoppingAfterWrite } from '$lib/server/shopping_entries';

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

	const body = await readJsonBody(request, PatchSchema);
	const targetSlug = body.add_slug ?? body.remove_slug!;

	let mealId: number;
	let changed: boolean;
	try {
		({ mealId, changed } = db.transaction((tx) => {
			const meal = tx
				.select({ id: recipes.id, contentRevision: recipes.contentRevision })
				.from(recipes)
				.where(eq(recipes.slug, params.slug))
				.get();
			if (!meal) throw error(404, 'Recipe not found');
			const target = tx
				.select({ id: recipes.id })
				.from(recipes)
				.where(eq(recipes.slug, targetSlug))
				.get();
			if (!target) throw error(404, 'Sub-recipe not found');

			const linkChanged = body.add_slug
				? addSubRecipe(tx, meal.id, target.id)
				: removeSubRecipe(tx, meal.id, target.id);
			if (linkChanged) {
				const updated = updateCanonicalRecipe(tx, {
					recipeId: meal.id,
					expectedRevision: meal.contentRevision,
					changes: { cookModeJson: null, cookModeGeneratedAt: null }
				});
				if (!updated) throw error(409, 'Recipe changed during the edit');
			}
			return { mealId: meal.id, changed: linkChanged };
		}));
	} catch (e) {
		if (e instanceof MealCompositionError) throw error(422, e.message);
		throw e;
	}

	// Composition changes invalidate the meal's combined bench sheet. The
	// canonical mutation above clears it and advances the recipe revision.
	if (changed) kickCookModeGeneration(params.slug);
	if (changed) reconcileShoppingAfterWrite(db);

	return json({ subRecipes: subRecipesOf(db, mealId) });
};
