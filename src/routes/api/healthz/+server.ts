import type { RequestHandler } from './$types';
import { checkDailyCap } from '$lib/server/ai/client';
import { getCap, getChatModel, getChatFallbackModel, getVisionModel, getBackgroundModel } from '$lib/server/ai/config';

// Unauthenticated endpoint (Railway healthcheck) — keep the payload boring:
// no DB size, no spend figures (F16). Status/ok semantics must stay a 200.
// ai_models/ai_caps report the *effective* config (household_prefs → env → default)
// so a forker can confirm a Settings change or a Railway env var actually took.
export const GET: RequestHandler = async () => {
	const { exceeded } = checkDailyCap();

	return Response.json({
		status: 'ok',
		version: '2.0.0',
		ai_cap: {
			exceeded,
			cap_eur: getCap('chat').value
		},
		ai_models: {
			chat: getChatModel(),
			chat_fallback: getChatFallbackModel(),
			vision: getVisionModel(),
			background: getBackgroundModel()
		},
		ai_caps: {
			chat: getCap('chat'),
			background: getCap('background')
		}
	});
};
