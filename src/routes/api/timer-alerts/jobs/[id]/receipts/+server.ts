import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import { timerAlertService } from '$lib/server/timer-alerts/runtime';
import { throwTimerAlertHttpError } from '$lib/server/timer-alerts/http';
import { TimerAlertReceiptBodySchema } from '$lib/server/timer-alerts/validation';

const IdSchema = z.string().uuid();

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const id = IdSchema.safeParse(params.id);
	if (!id.success) error(400, 'Invalid timer alert id');
	const body = await readJsonBody(request, TimerAlertReceiptBodySchema);
	try {
		return json(timerAlertService.recordReceipt(locals.user.id, id.data, body));
	} catch (cause) {
		throwTimerAlertHttpError(cause);
	}
};
