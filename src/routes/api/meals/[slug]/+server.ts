import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { MealCompositionError } from '$lib/server/domains/recipes';
import {
	changeMealComposition,
	getMealComponents
} from '$lib/server/workflows/meal-composition';
import { readJsonBody } from '$lib/server/api_body';

const PatchSchema = z
	.object({
		add_slug: z.string().min(1).optional(),
		remove_slug: z.string().min(1).optional()
	})
	.refine((data) => (data.add_slug ? 1 : 0) + (data.remove_slug ? 1 : 0) === 1, {
		message: 'Provide exactly one of add_slug or remove_slug'
	});

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const body = await readJsonBody(request, PatchSchema);
	try {
		const result = changeMealComposition({
			mealSlug: params.slug,
			targetSlug: body.add_slug ?? body.remove_slug!,
			action: body.add_slug ? 'add' : 'remove'
		});
		if (result.status === 'meal_not_found') throw error(404, 'Recipe not found');
		if (result.status === 'sub_not_found') throw error(404, 'Sub-recipe not found');
		if (result.status === 'stale') throw error(409, 'Recipe changed during the edit');
		return json({ subRecipes: getMealComponents(result.mealId) });
	} catch (cause) {
		if (cause instanceof MealCompositionError) throw error(422, cause.message);
		throw cause;
	}
};
