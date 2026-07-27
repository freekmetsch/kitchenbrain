import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import {
	removeAhFavorite,
	saveAhFavorite
} from '$lib/server/workflows/reconcile-shopping';

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

	saveAhFavorite({
		dutchTerm: name,
		productId,
		productName: (body.productName ?? '').trim()
	});
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const name = (url.searchParams.get('name') ?? '').trim();
	if (!name) error(400, 'name is required');
	removeAhFavorite(name);
	return json({ ok: true });
};
