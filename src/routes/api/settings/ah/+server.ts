import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { connectAH } from '$lib/server/ah/client';
import { readJsonBody } from '$lib/server/api_body';

const schema = z.object({
	// Raw pasted line from scripts/ah_local_login.py — parsed and validated server-side.
	payload: z.string().min(1)
});

// Validate a pasted member token pair against the AH member API and persist it
// to AH_TOKEN_FILE. Fail-closed: anonymous/garbage tokens are rejected — the
// shopping list itself accepts anon tokens, which is why it is never used here.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await readJsonBody(request, schema);

	let parsed: { access_token?: string; refresh_token?: string };
	try {
		parsed = JSON.parse(body.payload.trim());
	} catch {
		return json({ ok: false, reason: 'That is not valid JSON — paste the full line the login script prints.' }, { status: 400 });
	}

	const result = await connectAH(parsed);
	if (!result.ok) return json(result, { status: 400 });
	return json(result);
};
