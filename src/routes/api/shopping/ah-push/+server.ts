import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { readJsonBody } from '$lib/server/api_body';
import { AhPushBodySchema } from '$lib/server/ah/preview_tokens';
import {
	pushShoppingToAh,
	ShoppingAhWorkflowError
} from '$lib/server/workflows/push-shopping-to-ah';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const body = await readJsonBody(request, AhPushBodySchema);
	try {
		return json(
			await pushShoppingToAh({
				userId: locals.user.id,
				previewToken: body.previewToken,
				decisions: body.decisions
			})
		);
	} catch (cause) {
		if (cause instanceof ShoppingAhWorkflowError) {
			error(cause.status, cause.message);
		}
		throw cause;
	}
};
