import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import * as schema from '$lib/server/db/schema';
import { normalize } from '$lib/server/ah/matching';
import { readJsonBody } from '$lib/server/api_body';

// Household-level favorite AH product per ingredient name. One favorite per
// name (upsert); starring a different product replaces the old one.

const FavoriteSchema = z.object({
	name: z.string().min(1).max(256),
	productId: z.string().min(1).max(128),
	productName: z.string().max(256).nullable().optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const body = await readJsonBody(request, FavoriteSchema);

	const name = body.name.trim();
	const productId = body.productId.trim();
	if (!name || !productId) error(400, 'name and productId are required');

	db.insert(schema.ahFavorites)
		.values({
			nameKey: normalize(name),
			productId,
			productName: (body.productName ?? '').trim(),
			createdAt: new Date()
		})
		.onConflictDoUpdate({
			target: schema.ahFavorites.nameKey,
			set: { productId, productName: (body.productName ?? '').trim(), createdAt: new Date() }
		})
		.run();
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const name = (url.searchParams.get('name') ?? '').trim();
	if (!name) error(400, 'name is required');
	db.delete(schema.ahFavorites).where(eq(schema.ahFavorites.nameKey, normalize(name))).run();
	return json({ ok: true });
};
