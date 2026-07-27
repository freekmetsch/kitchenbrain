import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { MealCompositionError } from '$lib/server/domains/recipes';
import { createMeal, getMealCandidates } from '$lib/server/workflows/meal-composition';
import { readJsonBody } from '$lib/server/api_body';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	return json({ candidates: getMealCandidates() });
};

const CreateMealSchema = z.object({
	title: z.string().trim().min(1).max(120),
	sub_recipe_slugs: z.array(z.string().min(1)).min(2).max(12)
});

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const body = await readJsonBody(request, CreateMealSchema);
	try {
		const result = createMeal({ title: body.title, subRecipeSlugs: body.sub_recipe_slugs });
		if (!result.found) throw error(404, 'One of the selected recipes was not found');
		return json({ slug: result.meal.slug, id: result.meal.id, title: result.meal.title });
	} catch (cause) {
		if (cause instanceof MealCompositionError) throw error(422, cause.message);
		throw cause;
	}
};
