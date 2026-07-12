import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { deleteSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	const sessionId = cookies.get('session_id');
	if (sessionId) {
		deleteSession(sessionId);
		cookies.delete('session_id', { path: base || '/' });
	}
	redirect(303, base + '/login');
};
