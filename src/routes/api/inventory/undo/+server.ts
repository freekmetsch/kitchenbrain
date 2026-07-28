import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { inventoryService } from '$lib/server/workflows/inventory';
import { readJsonBody } from '$lib/server/api_body';
import { PreconditionConflictError } from '$lib/server/domains/inventory/commands';

const UndoSchema = z
	.object({
		item_id: z.number().optional(),
		op_id: z.number().optional(),
		op_ids: z.array(z.number().int().positive()).min(2).max(10).optional()
	})
	.refine((v) => v.item_id !== undefined || v.op_id !== undefined || v.op_ids !== undefined, {
		message: 'item_id, op_id, or op_ids required'
	});

// Undo is a compensating op (G3): item_id keeps the legacy toast contract
// (undo the latest remove); op_id targets any specific history entry.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const input = await readJsonBody(request, UndoSchema);

	const ctx = { actor: locals.user.username, userId: locals.user.id };
	try {
		if (input.op_ids) {
			const result = inventoryService.undoMany(input.op_ids, ctx);
			return json({ items: result.items });
		}
		const result =
			input.op_id !== undefined
				? inventoryService.undo(input.op_id, ctx)
				: inventoryService.undoLatestRemove(input.item_id!, ctx);

		if (!result.ok) {
			if (result.conflict) {
				return json({ ok: false, conflict: true, error: result.error }, { status: 409 });
			}
			throw error(404, result.error);
		}
		return json({ item: result.item });
	} catch (err) {
		if (err instanceof PreconditionConflictError) {
			return json({ ok: false, conflict: true, error: err.message }, { status: 409 });
		}
		throw err;
	}
};
