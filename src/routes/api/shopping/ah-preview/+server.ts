import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import { isoDateSchema } from '$lib/date_schema';
import { refreshAhPreviewToken } from '$lib/server/ah/preview_tokens';
import {
	AH_NOT_CONNECTED,
	getShoppingAhStatus,
	previewShoppingForAh,
	ShoppingAhWorkflowError
} from '$lib/server/workflows/push-shopping-to-ah';

const PreviewBodySchema = z
	.object({
		weekStart: isoDateSchema,
		entryIds: z.array(z.number().int().positive()).min(1).max(200)
	})
	.strict();

const RefreshBodySchema = z
	.object({ previewToken: z.string().min(20).max(256) })
	.strict();

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	if (!getShoppingAhStatus().connected) {
		return json({ ok: false, reason: AH_NOT_CONNECTED });
	}
	const body = await readJsonBody(request, PreviewBodySchema);
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

export const PATCH: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const body = await readJsonBody(request, RefreshBodySchema);
	if (!refreshAhPreviewToken(body.previewToken, locals.user.id)) {
		error(409, 'AH review expired or was replaced');
	}
	return json({ ok: true });
};
