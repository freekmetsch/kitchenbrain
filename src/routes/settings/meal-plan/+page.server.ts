import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { getMealPlanPrefs } from '$lib/server/meal_plan/prefs';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, base + '/login');

	return { prefs: getMealPlanPrefs() };
};
