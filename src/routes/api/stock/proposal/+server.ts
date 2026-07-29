import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import {
	applyStockActionProposalForApp,
	getStockActionProposalForApp,
	rejectStockActionProposalForApp,
	undoStockActionProposalForApp
} from '$lib/server/workflows/stock-action-proposal';

const ApplySchema = z
	.object({
		token: z.string().min(1),
		operationIds: z.array(z.string().min(1)).min(1).max(30)
	})
	.strict();
const TokenSchema = z.object({ token: z.string().min(1) }).strict();

export const GET: RequestHandler = ({ url, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const token = url.searchParams.get('token');
	if (!token) error(400, 'Invalid Stock proposal status request');
	try {
		return json(getStockActionProposalForApp({ token, userId: locals.user.id }));
	} catch (cause) {
		error(409, cause instanceof Error ? cause.message : 'Stock proposal unavailable');
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const body = await readJsonBody(request, ApplySchema);
	try {
		return json(
			applyStockActionProposalForApp({
				token: body.token,
				userId: locals.user.id,
				operationIds: body.operationIds
			})
		);
	} catch (cause) {
		error(409, cause instanceof Error ? cause.message : 'Stock proposal could not be applied');
	}
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const body = await readJsonBody(request, TokenSchema);
	try {
		return json(undoStockActionProposalForApp({ token: body.token, userId: locals.user.id }));
	} catch (cause) {
		error(409, cause instanceof Error ? cause.message : 'Stock proposal could not be undone');
	}
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const body = await readJsonBody(request, TokenSchema);
	try {
		return json(rejectStockActionProposalForApp({ token: body.token, userId: locals.user.id }));
	} catch (cause) {
		error(409, cause instanceof Error ? cause.message : 'Stock proposal could not be rejected');
	}
};
