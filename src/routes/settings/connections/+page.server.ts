import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { getAHStatus } from '$lib/server/ah/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, base + '/login');

	return {
		ah: getAHStatus()
	};
};
