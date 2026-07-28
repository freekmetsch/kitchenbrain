import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import { timerAlertService } from '$lib/server/timer-alerts/runtime';
import { TimerAlertScheduleBodySchema } from '$lib/server/timer-alerts/validation';
import { throwTimerAlertHttpError } from '$lib/server/timer-alerts/http';

const IdSchema = z.string().uuid();

export const PUT: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const id = IdSchema.safeParse(params.id);
	if (!id.success) error(400, 'Invalid timer alert id');
	const body = await readJsonBody(request, TimerAlertScheduleBodySchema);
	try {
		return json(timerAlertService.schedule(locals.user.id, id.data, body));
	} catch (cause) {
		if (cause instanceof Error && cause.message === 'Timer deadline does not match its duration') {
			error(400, cause.message);
		}
		throwTimerAlertHttpError(cause);
	}
};

export const DELETE: RequestHandler = ({ locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const id = IdSchema.safeParse(params.id);
	if (!id.success) error(400, 'Invalid timer alert id');
	timerAlertService.cancel(locals.user.id, id.data);
	return json({ ok: true });
};
