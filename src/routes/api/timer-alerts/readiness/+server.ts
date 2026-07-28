import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { timerAlertService } from '$lib/server/timer-alerts/runtime';

export const GET: RequestHandler = ({ locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	return json(timerAlertService.readiness());
};
