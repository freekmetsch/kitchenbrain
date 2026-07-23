import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { setAutoTranslateOnImport } from '$lib/server/recipes/prefs';
import { readJsonBody } from '$lib/server/api_body';

const schema = z.object({
	autoTranslateOnImport: z.boolean()
});

// Household-wide recipe-import AI-cost toggles. Persisted to household_prefs;
// the next import reads it — no redeploy. See lib/server/recipes/prefs.ts.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await readJsonBody(request, schema);
	setAutoTranslateOnImport(body.autoTranslateOnImport);

	return json({ ok: true });
};
