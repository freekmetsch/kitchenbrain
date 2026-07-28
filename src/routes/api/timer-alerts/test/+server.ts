import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import { timerAlertService } from '$lib/server/timer-alerts/runtime';
import { throwTimerAlertHttpError } from '$lib/server/timer-alerts/http';

const BodySchema = z.object({ subscriptionId: z.string().uuid() }).strict();

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const { subscriptionId } = await readJsonBody(request, BodySchema);
	try {
		return json(await timerAlertService.sendTest(locals.user.id, subscriptionId));
	} catch (cause) {
		throwTimerAlertHttpError(cause);
	}
};
