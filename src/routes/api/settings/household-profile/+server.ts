import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { K_HOUSEHOLD_PROFILE, setHouseholdPref } from '$lib/server/db/household_prefs';
import { readJsonBody } from '$lib/server/api_body';

const schema = z.object({ profile: z.string().max(2000) });

// Household-wide free-text profile injected into the AI system prompt via the
// {{household_profile}} placeholder. Persisted to household_prefs; the next
// chat turn reads it — no redeploy.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await readJsonBody(request, schema);

	setHouseholdPref(db, K_HOUSEHOLD_PROFILE, body.profile.trim());

	return json({ ok: true });
};
