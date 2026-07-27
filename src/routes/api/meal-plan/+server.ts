import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import { isoDateSchema } from '$lib/date_schema';
import { mealPlanService } from '$lib/server/workflows/meal-plan';

const CreateSchema = z.object({
	weekStartDate: isoDateSchema,
	dinner: z.string().min(1).max(500),
	recipeSlug: z.string().nullable().optional(),
	servings: z.number().int().positive().max(99).nullable().optional(),
	plannedDate: isoDateSchema.nullable().optional(),
	source: z.enum(['fresh', 'freezer']).optional(),
	note: z.string().max(2_000).nullable().optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await readJsonBody(request, CreateSchema);
	const result = mealPlanService.create({
		...body,
		sourcePolicy: 'coerce-fresh'
	});
	if (!result.ok) throw error(400, result.error);
	return json(result.meal);
};
