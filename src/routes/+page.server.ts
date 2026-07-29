import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/index';
import { checkDailyCap } from '$lib/server/ai/client';
import { recentChatPage } from '$lib/server/ai/recent_chat';
import { getLocale } from '$lib/paraglide/runtime';
import { getWeekStartDay } from '$lib/server/meal_plan/prefs';
import { deriveButlerBrief } from '$lib/server/butler/brief';
import { buildButlerSnapshot } from '$lib/server/butler/snapshot';
import { todayIso } from '$lib/week';

export const load: PageServerLoad = async ({ locals }) => {
	const history = recentChatPage(db, locals.user!.id);
	const today = todayIso();
	const brief = deriveButlerBrief(
		buildButlerSnapshot(db, {
			today,
			weekStartDay: getWeekStartDay(db)
		}),
		{ locale: getLocale() === 'nl' ? 'nl' : 'en' }
	);
	const { exceeded: capExceeded, capEur } = checkDailyCap();

	return { ...history, brief, capExceeded, capEur };
};
