import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import {
	searchShoppingForAh,
	ShoppingAhWorkflowError
} from '$lib/server/workflows/push-shopping-to-ah';

const BodySchema = z
	.object({
		previewToken: z.string().min(20).max(256),
		ref: z.string().min(1).max(256),
		query: z.string().trim().min(1).max(100)
	})
	.strict();

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const body = await readJsonBody(request, BodySchema);
	try {
		return json(
			await searchShoppingForAh({
				userId: locals.user.id,
				previewToken: body.previewToken,
				ref: body.ref,
				query: body.query
			})
		);
	} catch (cause) {
		if (cause instanceof ShoppingAhWorkflowError) {
			error(cause.status, cause.message);
		}
		throw cause;
	}
};
