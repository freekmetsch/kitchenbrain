import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import { isoDateSchema } from '$lib/date_schema';
import {
	AH_NOT_CONNECTED,
	getShoppingAhStatus,
	previewShoppingForAh,
	ShoppingAhWorkflowError
} from '$lib/server/workflows/push-shopping-to-ah';

const BodySchema = z
	.object({
		weekStart: isoDateSchema,
		entryIds: z.array(z.number().int().positive()).min(1).max(200)
	})
	.strict();

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	if (!getShoppingAhStatus().connected) {
		return json({ ok: false, reason: AH_NOT_CONNECTED });
	}
	const body = await readJsonBody(request, BodySchema);
	try {
		return json(
			await previewShoppingForAh({
				userId: locals.user.id,
				weekStart: body.weekStart,
				entryIds: body.entryIds
			})
		);
	} catch (cause) {
		if (cause instanceof ShoppingAhWorkflowError) {
			error(cause.status, cause.message);
		}
		throw cause;
	}
};
