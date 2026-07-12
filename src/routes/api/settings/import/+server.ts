import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import { db } from '$lib/server/db/index';
import { validateImportFile, importBootstrap } from '$lib/server/settings/import';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	// readJsonBody handles the malformed-JSON 400 the same way every other
	// settings route does; the shape itself is checked next by
	// validateImportFile, which needs the raw value for its cross-field checks.
	const raw = await readJsonBody(request, z.unknown());

	// Validation (shape, intra-file uniqueness, timestamp parseability) happens
	// before any DB access — a rejection here has touched zero rows (Correctness
	// Req #2).
	const validation = validateImportFile(raw);
	if (!validation.ok) {
		console.log(`[settings-data] import user=${locals.user.username} REJECTED: ${validation.error}`);
		return json({ ok: false, error: validation.error }, { status: 400 });
	}

	const outcome = importBootstrap(db, validation.data);
	if (!outcome.ok) {
		console.log(`[settings-data] import user=${locals.user.username} REJECTED: ${outcome.error}`);
		return json({ ok: false, error: outcome.error }, { status: 400 });
	}

	console.log(`[settings-data] import user=${locals.user.username} inserted=${JSON.stringify(outcome.inserted)}`);
	return json({ ok: true, inserted: outcome.inserted });
};
