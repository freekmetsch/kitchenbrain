import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { undoLatestRemoveForItem, undoOp } from '$lib/server/inventory_writes';
import { readJsonBody } from '$lib/server/api_body';

const UndoSchema = z
	.object({ item_id: z.number().optional(), op_id: z.number().optional() })
	.refine((v) => v.item_id !== undefined || v.op_id !== undefined, {
		message: 'item_id or op_id required'
	});

// Undo is a compensating op (G3): item_id keeps the legacy toast contract
// (undo the latest remove); op_id targets any specific history entry.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const input = await readJsonBody(request, UndoSchema);

	const ctx = { actor: locals.user.username, userId: locals.user.id };
	const result =
		input.op_id !== undefined
			? undoOp(db, input.op_id, ctx)
			: undoLatestRemoveForItem(db, input.item_id!, ctx);

	if (!result.ok) {
		if (result.conflict) return json({ ok: false, conflict: true, error: result.error }, { status: 409 });
		throw error(404, result.error);
	}
	return json({ item: result.item });
};
