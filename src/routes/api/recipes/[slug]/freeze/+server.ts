// P4.1 — freeze-from-cook. Creates a leftover inventory item linked to the
// recipe it was cooked from (kind=leftover, unit=portion). Merges into an
// existing linked leftover of the same recipe (portions sum) via the mutation
// boundary, so freezing twice adds up rather than duplicating.
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { freezeRecipeForApp } from '$lib/server/workflows/freeze-recipe';
import { readJsonBody } from '$lib/server/api_body';

const FreezeSchema = z.object({
	portions: z.number().int().positive().max(99)
});

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await readJsonBody(request, FreezeSchema);
	const result = freezeRecipeForApp(
		{ slug: params.slug, portions: body.portions },
		{ actor: locals.user.username, userId: locals.user.id }
	);
	if (!result) throw error(404, 'Recipe not found');

	return json(result);
};
