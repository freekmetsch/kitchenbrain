import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { db } from '$lib/server/db/index';
import { spending } from '$lib/server/db/schema';
import { gte } from 'drizzle-orm';
import { getChatTuning } from '$lib/server/ai/tuning';
import { getHouseholdPref, K_HOUSEHOLD_PROFILE } from '$lib/server/db/household_prefs';
import { getChatModel, getChatFallbackModel, getCap } from '$lib/server/ai/config';
import { modelShortcuts } from '$lib/server/ai/pricing';
import { isoDateInAppTimeZone } from '$lib/week';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, base + '/login');

	// Last 7 days spending
	const d = new Date();
	d.setDate(d.getDate() - 6);
	const sevenDaysAgoIso = isoDateInAppTimeZone(d);

	const spendRows = db
		.select({ date: spending.date, costEur: spending.costEur })
		.from(spending)
		.where(gte(spending.date, sevenDaysAgoIso))
		.all();

	const dailySpend: Record<string, number> = {};
	for (const row of spendRows) {
		dailySpend[row.date] = (dailySpend[row.date] ?? 0) + row.costEur;
	}

	return {
		dailySpend,
		householdProfile: getHouseholdPref(db, K_HOUSEHOLD_PROFILE) ?? '',
		chatTuning: getChatTuning(),
		chatModel: getChatModel(),
		chatFallbackModel: getChatFallbackModel(),
		chatCap: getCap('chat'),
		backgroundCap: getCap('background'),
		chatModelShortcuts: modelShortcuts('chat')
	};
};
