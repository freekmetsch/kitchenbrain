import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import { patchRecipeMetadata } from '$lib/server/workflows/recipe-metadata';
import { RotationSettingsError } from '$lib/meal_rotation';

const PatchSchema = z.object({
	is_freezer_staple: z.boolean().optional(),
	target_portions: z.number().int().min(1).max(99).nullable().optional(),
	rotation_policy: z
		.enum(['never', 'weekly', 'fortnightly', 'monthly', 'seasonal', 'special'])
		.nullable()
		.optional(),
	rotation_seasons: z
		.array(z.enum(['spring', 'summer', 'autumn', 'winter']))
		.optional(),
	dismiss_review: z.boolean().optional(),
	archived: z.boolean().optional()
});

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const input = await readJsonBody(request, PatchSchema);
	let updated: ReturnType<typeof patchRecipeMetadata>;
	try {
		updated = patchRecipeMetadata(params.slug, {
			isFreezerStaple: input.is_freezer_staple,
			targetPortions: input.target_portions,
			rotationPolicy: input.rotation_policy,
			rotationSeasons: input.rotation_seasons,
			dismissReview: input.dismiss_review,
			archived: input.archived
		});
	} catch (cause) {
		if (cause instanceof RotationSettingsError) throw error(400, cause.message);
		throw cause;
	}
	if (!updated) throw error(404, 'Recipe not found');
	return json(updated);
};
