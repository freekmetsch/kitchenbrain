// Create a Meal Recipe (ADR 0003): a normal recipes row linked to >= 2
// standalone sub-recipes. Own extras (tortillas, assembly directions) are
// added afterwards via the regular recipe edit page.
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { inArray, notInArray } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { mealSubRecipes, recipes } from '$lib/server/db/schema';
import { createMealRecipe, MealCompositionError } from '$lib/server/meal_recipes';
import { kickCookModeGeneration } from '$lib/server/ai/cook_mode';
import { readJsonBody } from '$lib/server/api_body';

// Sub-recipe candidates for the add/create pickers: every recipe that is not
// itself a meal (one-level invariant). Being a sub of another meal is fine —
// guacamole can be part of taco night AND burrito night.
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const mealIds = db
		.select({ id: mealSubRecipes.mealRecipeId })
		.from(mealSubRecipes)
		.all()
		.map((r) => r.id);
	const rows = db
		.select({ slug: recipes.slug, title: recipes.title, titleEn: recipes.titleEn })
		.from(recipes)
		.where(mealIds.length ? notInArray(recipes.id, mealIds) : undefined)
		.all();
	return json({ candidates: rows });
};

const CreateMealSchema = z.object({
	title: z.string().trim().min(1).max(120),
	sub_recipe_slugs: z.array(z.string().min(1)).min(2).max(12)
});

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await readJsonBody(request, CreateMealSchema);

	const subs = db
		.select({ id: recipes.id, slug: recipes.slug })
		.from(recipes)
		.where(inArray(recipes.slug, body.sub_recipe_slugs))
		.all();
	if (subs.length !== new Set(body.sub_recipe_slugs).size) {
		throw error(404, 'One of the selected recipes was not found');
	}

	try {
		const meal = createMealRecipe(db, {
			title: body.title,
			subRecipeIds: subs.map((s) => s.id)
		});
		// Pre-generate the combined bench sheet so the meal's first open is instant.
		kickCookModeGeneration(meal.slug);
		return json({ slug: meal.slug, id: meal.id, title: meal.title });
	} catch (e) {
		if (e instanceof MealCompositionError) throw error(422, e.message);
		throw e;
	}
};
