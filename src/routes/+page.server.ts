import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/index';
import { checkDailyCap } from '$lib/server/ai/client';
import { recentChatPage } from '$lib/server/ai/recent_chat';
import { getLocale } from '$lib/paraglide/runtime';

export const load: PageServerLoad = async ({ locals, url }) => {
	const history = recentChatPage(db, locals.user!.id);
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
		assistantDraft,
		capExceeded,
		capEur
	};
};
