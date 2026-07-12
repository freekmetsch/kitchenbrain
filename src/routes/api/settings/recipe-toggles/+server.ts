import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { setAutoTranslateOnImport, setCookModePreGeneration } from '$lib/server/recipes/prefs';
import { readJsonBody } from '$lib/server/api_body';

const schema = z.object({
	autoTranslateOnImport: z.boolean().optional(),
	cookModePreGeneration: z.boolean().optional()
});

// Household-wide recipe-import AI-cost toggles. Persisted to household_prefs;
// the next import reads it — no redeploy. See lib/server/recipes/prefs.ts.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await readJsonBody(request, schema);
	if (body.autoTranslateOnImport === undefined && body.cookModePreGeneration === undefined) {
		throw error(400, 'No fields to update');
	}

	if (body.autoTranslateOnImport !== undefined) {
		setAutoTranslateOnImport(body.autoTranslateOnImport);
	}
	if (body.cookModePreGeneration !== undefined) {
		setCookModePreGeneration(body.cookModePreGeneration);
	}

	return json({ ok: true });
};
