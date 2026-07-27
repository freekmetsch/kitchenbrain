// Serve-from-freezer consumption: eating a planned freezer meal takes N
// portions out of the leftover(s) linked to the recipe. Counterpart of
// /freeze — goes through the inventory mutation boundary so every decrement
// is logged and undoable, and a leftover that reaches 0 portions is removed
// (which re-surfaces the freezer-staple "cook again" ghost row on the stock
// page instead of leaving a dead 0-portion entry).
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import {
	consumeRecipeForApp,
	RecipeInventoryMutationError
} from '$lib/server/workflows/consume-recipe';
import { readJsonBody } from '$lib/server/api_body';

const ConsumeSchema = z.object({
	portions: z.number().int().positive().max(99)
});

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await readJsonBody(request, ConsumeSchema);

	try {
		const result = consumeRecipeForApp(
			{ slug: params.slug, portions: body.portions },
			{ actor: locals.user.username, userId: locals.user.id }
		);
		if (!result) throw error(404, 'Recipe not found');
		return json(result);
	} catch (cause) {
		if (cause instanceof RecipeInventoryMutationError) {
			throw error(500, cause.message);
		}
		throw cause;
	}
};
