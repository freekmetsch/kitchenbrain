import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import { isoDateSchema } from '$lib/date_schema';
import { mealPlanService } from '$lib/server/workflows/meal-plan';

const RotationCreateSchema = z.object({
	weekStartDate: isoDateSchema,
	recipeSlug: z.string().min(1),
	candidateKey: z.string().min(1)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const body = await readJsonBody(request, RotationCreateSchema);
	const result = mealPlanService.createFromRotation(body);
	if (!result.ok) {
		return json(
			{ code: result.code, candidates: result.candidates },
			{ status: 409 }
		);
	}
	return json(result.meal);
};
