import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import {
	applyAfterCookProposalForApp,
	getAfterCookProposalStatusForApp,
	rejectAfterCookProposalForApp,
	undoAfterCookProposalForApp
} from '$lib/server/workflows/after-cook';

const TokenSchema = z.object({ token: z.string().min(20).max(256) }).strict();
const ApplySchema = TokenSchema.extend({
	eatenPortions: z.number().int().min(0).max(99)
}).strict();

export const GET: RequestHandler = ({ url, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const token = url.searchParams.get('token');
	const mealId = Number(url.searchParams.get('mealId'));
	if (!token || !Number.isInteger(mealId) || mealId <= 0) {
		error(400, 'Invalid after-cook status request');
	}
	try {
		return json(
			getAfterCookProposalStatusForApp({ token, mealId, userId: locals.user.id })
		);
	} catch (cause) {
		error(409, cause instanceof Error ? cause.message : 'After-cook review unavailable');
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const body = await readJsonBody(request, ApplySchema);
	try {
		return json(
			applyAfterCookProposalForApp({
				token: body.token,
				userId: locals.user.id,
				eatenPortions: body.eatenPortions
			})
		);
	} catch (cause) {
		error(409, cause instanceof Error ? cause.message : 'After-cook review could not be applied');
	}
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const body = await readJsonBody(request, TokenSchema);
	try {
		return json(undoAfterCookProposalForApp({ token: body.token, userId: locals.user.id }));
	} catch (cause) {
		error(409, cause instanceof Error ? cause.message : 'After-cook review could not be undone');
	}
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const body = await readJsonBody(request, TokenSchema);
	try {
		return json(rejectAfterCookProposalForApp({ token: body.token, userId: locals.user.id }));
	} catch (cause) {
		error(409, cause instanceof Error ? cause.message : 'After-cook review could not be rejected');
	}
};
