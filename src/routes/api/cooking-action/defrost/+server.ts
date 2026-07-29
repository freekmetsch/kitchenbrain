import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import { db } from '$lib/server/db';
import { PreconditionConflictError } from '$lib/server/domains/inventory/commands';
import {
	moveDefrostedItemToFridge,
	undoDefrostMove
} from '$lib/server/workflows/defrost-action';

const CompleteSchema = z
	.object({
		item_id: z.number().int().positive(),
		expected_updated_at: z.string().datetime()
	})
	.strict();
const UndoSchema = z.object({ op_id: z.number().int().positive() }).strict();

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const input = await readJsonBody(request, CompleteSchema);
	try {
		const result = moveDefrostedItemToFridge(
			db,
			{ itemId: input.item_id, expectedUpdatedAt: input.expected_updated_at },
			{ actor: locals.user.username, userId: locals.user.id }
		);
		return json({ ok: true, item: result.item, opId: result.opId });
	} catch (cause) {
		if (cause instanceof PreconditionConflictError) error(409, cause.message);
		throw cause;
	}
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const input = await readJsonBody(request, UndoSchema);
	const result = undoDefrostMove(db, input.op_id, {
		actor: locals.user.username,
		userId: locals.user.id
	});
	if (!result.ok) {
		error(result.conflict ? 409 : 404, result.error);
	}
	return json({ ok: true, item: result.item, opId: result.opId });
};
