import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { setChatTuning, setTemperature, resetTemperature } from '$lib/server/ai/tuning';
import { readJsonBody } from '$lib/server/api_body';

const schema = z.object({
	reasoning: z.enum(['default', 'off']).optional(),
	provider_sort: z.enum(['auto', 'latency', 'throughput', 'price']).optional(),
	// null resets to the env/default chain (deletes the row); omit to leave it untouched.
	temperature: z.number().finite().min(0).max(2).nullable().optional()
});

// Household-wide chat-model tuning (reasoning + provider routing + temperature).
// Persisted to household_prefs; the next chat turn reads it — no redeploy. See ai/tuning.ts.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await readJsonBody(request, schema);

	setChatTuning({ reasoning: body.reasoning, providerSort: body.provider_sort });
	if (body.temperature === null) resetTemperature();
	else if (body.temperature !== undefined) setTemperature(body.temperature);

	return json({ ok: true });
};
