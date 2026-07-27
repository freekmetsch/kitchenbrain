import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import { patchRecipeMetadata } from '$lib/server/workflows/recipe-metadata';

const PatchSchema = z.object({
	is_freezer_staple: z.boolean().optional(),
	target_portions: z.number().int().min(1).max(99).nullable().optional(),
	dismiss_review: z.boolean().optional()
});

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const input = await readJsonBody(request, PatchSchema);
	const updated = patchRecipeMetadata(params.slug, {
		isFreezerStaple: input.is_freezer_staple,
		targetPortions: input.target_portions,
		dismissReview: input.dismiss_review
	});
	if (!updated) throw error(404, 'Recipe not found');
	return json(updated);
};
