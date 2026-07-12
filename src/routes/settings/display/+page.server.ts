import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import type { PageServerLoad } from './$types';

// Theme comes from the root +layout.server.ts load (data.theme) — this panel
// holds no settings of its own since recipe language moved to the Recipes
// panel (Phase 4). The guard below matches every other settings sub-route.
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, base + '/login');
	return {};
};
