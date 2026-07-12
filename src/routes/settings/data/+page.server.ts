import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { db } from '$lib/server/db/index';
import { RESET_GROUP_KEYS, RESET_GROUPS, countGroupRows } from '$lib/server/settings/reset';
import { isBootstrapEligible, NOT_EMPTY_ERROR } from '$lib/server/settings/import';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, base + '/login');

	// Row counts + import eligibility must still resolve even if a prior
	// reset/import left the DB in an odd state — this load has no write path,
	// only read-only counts (Correctness Req #5).
	const counts = countGroupRows(db);
	const resetGroups = RESET_GROUP_KEYS.map((key) => ({
		key,
		label: RESET_GROUPS[key].label,
		description: RESET_GROUPS[key].description,
		count: counts[key]
	}));

	return { resetGroups, importEligible: isBootstrapEligible(db), importIneligibleReason: NOT_EMPTY_ERROR };
};
