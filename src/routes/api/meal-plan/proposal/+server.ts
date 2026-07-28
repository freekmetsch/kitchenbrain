import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import { isoDateSchema } from '$lib/date_schema';
import {
	applyMealPlanProposalForApp,
	getMealPlanProposalStatusForApp,
	rejectMealPlanProposalForApp,
	undoMealPlanProposalForApp
} from '$lib/server/workflows/meal-plan-proposal';

const ApplySchema = z
	.object({
		token: z.string().min(1),
		operationIds: z.array(z.string().min(1)).min(1).max(14)
	})
	.strict();

const UndoSchema = z.object({ token: z.string().min(1) }).strict();

export const GET: RequestHandler = ({ url, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const token = url.searchParams.get('token');
	const weekStartDate = url.searchParams.get('weekStartDate');
	if (!token || !weekStartDate || !isoDateSchema.safeParse(weekStartDate).success) {
		error(400, 'Invalid meal-plan proposal status request');
	}
	try {
		return json(
			getMealPlanProposalStatusForApp({
				token,
				userId: locals.user.id,
				weekStartDate
			})
		);
	} catch (cause) {
		error(409, cause instanceof Error ? cause.message : 'Meal-plan proposal unavailable');
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const body = await readJsonBody(request, ApplySchema);
	try {
		return json(
			await applyMealPlanProposalForApp({
				token: body.token,
				userId: locals.user.id,
				operationIds: body.operationIds
			})
		);
	} catch (cause) {
		error(409, cause instanceof Error ? cause.message : 'Meal-plan proposal could not be applied');
	}
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const body = await readJsonBody(request, UndoSchema);
	try {
		return json(
			undoMealPlanProposalForApp({
				token: body.token,
				userId: locals.user.id
			})
		);
	} catch (cause) {
		error(409, cause instanceof Error ? cause.message : 'Meal-plan proposal could not be undone');
	}
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const body = await readJsonBody(request, UndoSchema);
	try {
		return json(
			rejectMealPlanProposalForApp({
				token: body.token,
				userId: locals.user.id
			})
		);
	} catch (cause) {
		error(409, cause instanceof Error ? cause.message : 'Meal-plan proposal could not be rejected');
	}
};
