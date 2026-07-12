import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { prefs } from '$lib/server/db/schema';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';

const schema = z.object({ theme: z.enum(['light', 'dark']) });

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await readJsonBody(request, schema);

	db.insert(prefs)
		.values({ userId: locals.user.id, key: 'theme', value: body.theme, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: [prefs.userId, prefs.key],
			set: { value: body.theme, updatedAt: new Date() }
		})
		.run();

	return json({ ok: true });
};
