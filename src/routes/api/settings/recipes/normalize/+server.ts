import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/index';
import { normalizeLegacyRecipes } from '$lib/server/ai/recipe_normalization';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	return json(await normalizeLegacyRecipes(db));
};
