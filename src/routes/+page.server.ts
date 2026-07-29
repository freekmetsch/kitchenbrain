import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/index';
import { checkDailyCap } from '$lib/server/ai/client';
import { recentChatPage } from '$lib/server/ai/recent_chat';
import { getLocale } from '$lib/paraglide/runtime';
import { getWeekStartDay } from '$lib/server/meal_plan/prefs';
import { deriveButlerBrief } from '$lib/server/butler/brief';
import { buildButlerSnapshot } from '$lib/server/butler/snapshot';
import { getProvableHouseholdChanges } from '$lib/server/butler/changes';
import {
	applyButlerServiceState,
	getButlerServiceState
} from '$lib/server/butler/state';
import { todayIso } from '$lib/week';

export const load: PageServerLoad = async ({ locals, url }) => {
	const history = recentChatPage(db, locals.user!.id);
	const now = new Date();
	const today = todayIso();
	const candidates = deriveButlerBrief(
		buildButlerSnapshot(db, {
			today,
			weekStartDay: getWeekStartDay(db)
		}),
		{ locale: getLocale() === 'nl' ? 'nl' : 'en', limit: 6 }
	);
	const butlerState = getButlerServiceState(
		db,
		locals.user!.id,
		candidates.map((candidate) => candidate.id)
	);
	const applied = applyButlerServiceState(candidates, butlerState, now);
	const brief = applied.visible.slice(0, 3);
	const butlerChanges = getProvableHouseholdChanges(db, {
		since: butlerState.changesSeenThrough,
		through: now
	});
	const { exceeded: capExceeded, capEur } = checkDailyCap();
	const cookRecipe = url.searchParams.get('cook_recipe')?.trim() ?? '';
	const rawCookStep = Number(url.searchParams.get('cook_step'));
	const cookIssue = url.searchParams.get('cook_issue');
	const safeCookContext =
		/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(cookRecipe) &&
		Number.isInteger(rawCookStep) &&
		rawCookStep >= 0 &&
		rawCookStep <= 99 &&
		(cookIssue === 'too_salty' ||
			cookIssue === 'too_thin' ||
			cookIssue === 'not_browning');
	const assistantDraft = safeCookContext
		? getLocale() === 'nl'
			? `Help me met ${cookRecipe}, stap ${rawCookStep + 1}: ${cookIssue === 'too_salty' ? 'het is te zout' : cookIssue === 'too_thin' ? 'het is te dun' : 'het wordt niet bruin'}.`
			: `Help me with ${cookRecipe}, step ${rawCookStep + 1}: ${cookIssue === 'too_salty' ? 'it is too salty' : cookIssue === 'too_thin' ? 'it is too thin' : 'it is not browning'}.`
		: '';

	return {
		...history,
		brief,
		triagedBrief: applied.triaged,
		quietBriefCount: applied.quiet.length,
		butlerInitiative: butlerState.initiative,
		butlerChanges,
		assistantDraft,
		capExceeded,
		capEur
	};
};
