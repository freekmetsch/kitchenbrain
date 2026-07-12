import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { DailyCapExceeded } from '$lib/server/ai/client';
import { generateCookMode } from '$lib/server/ai/cook_mode';

export const POST: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	try {
		const result = await generateCookMode(params.slug, {
			force: url.searchParams.get('force') === 'true'
		});
		if (!result) throw error(404, 'Recipe not found');
		if (!result.recipe.cookModeJson && result.reason === 'no_directions') {
			return json({ status: 'unavailable', reason: 'no_directions' }, { status: 422 });
		}
		return json({
			status: 'ready',
			cookMode: result.recipe.cookModeJson,
			generated: result.generated
		});
	} catch (err) {
		if (err instanceof DailyCapExceeded) {
			return json(
				{ status: 'pending', reason: 'daily_cap_exceeded', message: 'Daily AI budget reached' },
				{ status: 429 }
			);
		}
		console.error('[cook-mode] generation failed', params.slug, err);
		return json({ status: 'error', message: 'Cook mode generation failed' }, { status: 500 });
	}
};
