import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/index';
import { checkDailyCap } from '$lib/server/ai/client';
import { recentChatPage } from '$lib/server/ai/recent_chat';

export const load: PageServerLoad = async ({ locals }) => {
	const history = recentChatPage(db, locals.user!.id);
	const { exceeded: capExceeded, capEur } = checkDailyCap();

	return { ...history, capExceeded, capEur };
};
