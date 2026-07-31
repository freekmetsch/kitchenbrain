import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import {
	proposeRecipeRotationSeasons,
	recipeRotationSeasonService,
	RotationSeasonConflict
} from '$lib/server/workflows/recipe-rotation-seasons';

const SeasonSchema = z.enum(['spring', 'summer', 'autumn', 'winter']);
const RequestSchema = z.discriminatedUnion('action', [
	z.object({ action: z.literal('propose') }),
	z.object({
		action: z.literal('apply'),
		items: z
			.array(
				z.object({
					recipeId: z.number().int().positive(),
					seasons: z.array(SeasonSchema).min(1).max(4),
					expectedUpdatedAt: z.number().int().nonnegative()
				})
			)
			.min(1)
			.max(40)
	}),
	z.object({
		action: z.literal('undo'),
		items: z
			.array(
				z.object({
					recipeId: z.number().int().positive(),
					previousSeasons: z.array(SeasonSchema).max(4),
					appliedSeasons: z.array(SeasonSchema).min(1).max(4),
					appliedUpdatedAt: z.number().int().nonnegative()
				})
			)
			.min(1)
			.max(40)
	})
]);

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const body = await readJsonBody(request, RequestSchema);
	try {
		if (body.action === 'propose') {
			return json({ proposals: await proposeRecipeRotationSeasons() });
		}
		if (body.action === 'apply') return json(recipeRotationSeasonService.apply(body.items));
		return json(recipeRotationSeasonService.undo(body.items));
	} catch (cause) {
		if (cause instanceof RotationSeasonConflict) {
			return json({ code: 'rotation_season_conflict' }, { status: 409 });
		}
		if (cause instanceof Error && /daily background ai cap/i.test(cause.message)) {
			return json({ code: 'background_cap_reached' }, { status: 429 });
		}
		throw cause;
	}
};
