import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { checkDailyCap } from '$lib/server/ai/client';
import { recentChatMessages } from '$lib/server/ai/recent_chat';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	return json({
		messages: recentChatMessages(db, locals.user.id),
		capExceeded: checkDailyCap().exceeded
	});
};
