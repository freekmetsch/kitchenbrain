import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import { timerAlertService } from '$lib/server/timer-alerts/runtime';
import { SubscriptionBodySchema } from '$lib/server/timer-alerts/validation';
import { throwTimerAlertHttpError } from '$lib/server/timer-alerts/http';

const DeleteBodySchema = z.object({ subscriptionId: z.string().uuid() }).strict();

export const PUT: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const body = await readJsonBody(request, SubscriptionBodySchema);
	try {
		return json(timerAlertService.subscribe(locals.user.id, body));
	} catch (cause) {
		throwTimerAlertHttpError(cause);
	}
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const { subscriptionId } = await readJsonBody(request, DeleteBodySchema);
	timerAlertService.removeSubscription(locals.user.id, subscriptionId);
	return json({ ok: true });
};
