import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { setUserPref } from '$lib/server/db/user_prefs';
import { SORT_VALUES } from '$lib/recipe_sort';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';

const schema = z.object({
	recipeLanguage: z.enum(['en', 'nl']).optional(),
	defaultSort: z.enum(SORT_VALUES).optional()
});

// Per-user recipe display preferences: language + default list sort. Extends
// the original recipe-language-only endpoint (Phase 1) with sort — same
// prefs table, one endpoint instead of a near-duplicate second POST.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await readJsonBody(request, schema);
	if (body.recipeLanguage === undefined && body.defaultSort === undefined) {
		throw error(400, 'No fields to update');
	}

	if (body.recipeLanguage !== undefined) {
		setUserPref(db, locals.user.id, 'recipe_view_language', body.recipeLanguage);
	}
	if (body.defaultSort !== undefined) {
		setUserPref(db, locals.user.id, 'recipe_default_sort', body.defaultSort);
	}

	return json({ ok: true });
};
