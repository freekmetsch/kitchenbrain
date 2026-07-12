import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { DailyCapExceeded } from '$lib/server/ai/client';
import { translateRecipe } from '$lib/server/ai/translate_recipe';

export const POST: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	try {
		const recipe = await translateRecipe(params.slug, { force: url.searchParams.get('force') === 'true' });
		if (!recipe) throw error(404, 'Recipe not found');
		return json({ status: recipe.translationStatus, recipe });
	} catch (err) {
		if (err instanceof DailyCapExceeded) {
			return json(
				{ status: 'pending', reason: 'daily_cap_exceeded', message: 'Daily AI budget reached' },
				{ status: 429 }
			);
		}
		throw err;
	}
};
