import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { todayIso } from '$lib/week';
import { readJsonBody, readPositiveIntParam } from '$lib/server/api_body';
import { isoDateSchema } from '$lib/date_schema';
import { mealPlanService } from '$lib/server/workflows/meal-plan';

const UpdateSchema = z.object({
	status: z.enum(['planned', 'cooked']).nullable().optional(),
	cookedDate: isoDateSchema.nullable().optional(),
	plannedDate: isoDateSchema.nullable().optional(),
	source: z.enum(['fresh', 'freezer']).optional(),
	servings: z.number().int().positive().max(99).nullable().optional()
});

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const id = readPositiveIntParam(params.id);
	const body = await readJsonBody(request, UpdateSchema);

	// Metadata-only update (day pin and/or fresh↔freezer source): must not touch
	// the cooked status (the legacy contract below defaults a bare PUT to 'cooked').
	if (
		(body.plannedDate !== undefined || body.source !== undefined || body.servings !== undefined) &&
		body.status === undefined &&
		body.cookedDate === undefined
	) {
		const updates: Partial<{ plannedDate: string | null; source: 'fresh' | 'freezer'; servings: number | null }> = {};
		if (body.plannedDate !== undefined) updates.plannedDate = body.plannedDate;
		if (body.servings !== undefined) updates.servings = body.servings;
		if (body.source !== undefined) updates.source = body.source;
		const result = mealPlanService.updateMetadata(id, updates);
		if (!result.ok) {
			throw error(result.code === 'not_found' ? 404 : 400, result.error);
		}
		return json(result.meal);
	}

	const newStatus: 'planned' | 'cooked' = body.status ?? 'cooked';
	const cookedDate = newStatus === 'planned' ? null : (body.cookedDate ?? todayIso());

	const result =
		newStatus === 'cooked'
			? mealPlanService.cook(id, cookedDate as string)
			: mealPlanService.uncook(id);
	if (!result.ok) throw error(404, result.error);
	return json(result.meal);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const id = readPositiveIntParam(params.id);
	const result = mealPlanService.remove(id, { unrecordCooked: true });
	if (!result.ok) throw error(404, result.error);
	return json({ ok: true, meal: result.meal });
};
