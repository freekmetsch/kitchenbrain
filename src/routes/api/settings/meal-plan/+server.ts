import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import {
	setWeekStartDay,
	setGroceryDay,
	setPlanAheadWeeks,
	setDayPlanning,
	setRepeatCycleDays,
	setSuggestCount
} from '$lib/server/meal_plan/prefs';
import { readJsonBody } from '$lib/server/api_body';

const schema = z.object({
	weekStartDay: z.number().int().min(0).max(6).optional(),
	groceryDay: z.number().int().min(0).max(6).nullable().optional(),
	planAheadWeeks: z.number().int().min(1).max(8).optional(),
	dayPlanning: z.boolean().optional(),
	repeatCycleDays: z.number().int().min(0).max(365).optional(),
	suggestCount: z.number().int().min(1).max(10).optional()
});

// Household-wide meal-planning knobs. Persisted to household_prefs; the next
// meal-plan/shopping load reads them — no redeploy. See lib/server/meal_plan/prefs.ts.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await readJsonBody(request, schema);
	if (Object.values(body).every((v) => v === undefined)) throw error(400, 'No fields to update');

	if (body.weekStartDay !== undefined) setWeekStartDay(body.weekStartDay);
	if (body.groceryDay !== undefined) setGroceryDay(body.groceryDay);
	if (body.planAheadWeeks !== undefined) setPlanAheadWeeks(body.planAheadWeeks);
	if (body.dayPlanning !== undefined) setDayPlanning(body.dayPlanning);
	if (body.repeatCycleDays !== undefined) setRepeatCycleDays(body.repeatCycleDays);
	if (body.suggestCount !== undefined) setSuggestCount(body.suggestCount);

	return json({ ok: true });
};
