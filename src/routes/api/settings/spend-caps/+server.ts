import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import { getCap, setCap, resetCap } from '$lib/server/ai/config';

const schema = z
	.object({
		category: z.enum(['chat', 'background']),
		// Hard upper bound €20/day (Guardrails) — a fat-fingered "200" shouldn't wake
		// a forker up to a four-figure OpenRouter bill.
		cap_eur: z.number().finite().positive().max(20).optional(),
		reset: z.boolean().optional()
	})
	.refine((b) => b.reset || b.cap_eur !== undefined, {
		message: 'cap_eur is required unless reset is true'
	});

// Household-wide daily spend caps (chat / background). Persisted to household_prefs;
// checkDailyCap reads it on the next request. See ai/config.ts.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await readJsonBody(request, schema);

	if (body.reset) {
		resetCap(body.category);
		return json({ ok: true, effective: getCap(body.category) });
	}

	setCap(body.category, body.cap_eur!);
	return json({ ok: true, effective: { value: body.cap_eur!, source: 'ui' } });
};
