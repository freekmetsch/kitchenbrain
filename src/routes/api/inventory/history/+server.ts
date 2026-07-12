import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { listInventoryHistory } from '$lib/server/inventory_history_query';

// P2.3 read surface: per-item timeline (?item_id=N) or the global recent-activity
// feed. The enrichment (actor label, human summary, undoability) lives in the
// shared listInventoryHistory query, reused by the chat get_inventory_history tool.
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const itemIdParam = url.searchParams.get('item_id');
	const itemId = itemIdParam !== null ? Number(itemIdParam) : null;
	if (itemIdParam !== null && !Number.isInteger(itemId)) throw error(400, 'Invalid item_id');

	// Absent/empty `limit` → default (Number(null)/Number('') are 0, so guard the raw value first).
	const rawLimit = url.searchParams.get('limit');
	const parsedLimit = rawLimit ? Number(rawLimit) : NaN;

	const events = listInventoryHistory(db, {
		itemId,
		limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined
	});

	return json({ events });
};
