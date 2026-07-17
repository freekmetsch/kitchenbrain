import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { db } from '$lib/server/db/index';
import { spending } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getUserPref } from '$lib/server/db/user_prefs';
import { getChatModel, getCap } from '$lib/server/ai/config';
import { getChatTuning } from '$lib/server/ai/tuning';
import { getMealPlanPrefs } from '$lib/server/meal_plan/prefs';
import { getAHStatus } from '$lib/server/ah/client';
import { todayIso } from '$lib/week';
import type { PageServerLoad } from './$types';

// Index panel: lightweight per-panel summary lines only — each drill-down
// route (display/ai/recipes/connections/account/data/advanced) does its own
// full load.
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, base + '/login');

	const today = todayIso();
	const todaySpendEur = db
		.select({ costEur: spending.costEur })
		.from(spending)
		.where(eq(spending.date, today))
		.all()
		.reduce((s, r) => s + r.costEur, 0);

	const defaultSort = getUserPref(db, locals.user.id, 'recipe_default_sort') ?? 'title';

	return {
		username: locals.user.username,
		ahConnected: getAHStatus().connected,
		chatModel: getChatModel().value,
		reasoning: getChatTuning().reasoning,
		todaySpendEur,
		chatCapEur: getCap('chat').value,
		defaultSort,
		mealPlanPrefs: getMealPlanPrefs()
	};
};
