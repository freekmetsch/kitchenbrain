import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { DailyCapExceeded } from '$lib/server/ai/client';
import { generateCookMode } from '$lib/server/ai/cook_mode';

export const POST: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const language = url.searchParams.get('lang');
	const servingsParam = url.searchParams.get('servings');
	const servings = servingsParam == null ? undefined : Number(servingsParam);
	if (language != null && language !== 'en' && language !== 'nl') {
		return json({ status: 'error', message: 'Unsupported cooking-view language' }, { status: 400 });
	}
	if (servings != null && (!Number.isInteger(servings) || servings < 1 || servings > 99)) {
		return json({ status: 'error', message: 'Servings must be between 1 and 99' }, { status: 400 });
	}

	try {
		const result = await generateCookMode(params.slug, {
			force: url.searchParams.get('force') === 'true',
			language: language ?? undefined,
			servings
		});
		if (!result) return json({ status: 'error', message: 'Recipe not found' }, { status: 404 });
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
