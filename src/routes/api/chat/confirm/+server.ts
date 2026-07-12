import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { claimPendingAction } from '$lib/server/ai/pending_actions';
import { executeToolCall, isOk } from '$lib/server/ai/executors';
import { buildToolDisplay } from '$lib/server/ai/tool_display';
import { PreconditionConflictError } from '$lib/server/inventory_writes';
import { readJsonBody } from '$lib/server/api_body';

const ConfirmSchema = z.object({ confirmation_id: z.string() });

// Approve a deferred chat action (P5.3). The only path that commits a
// confirm-gated op: the client posts back the server-issued confirmation_id,
// we claim it (single-use, userId-scoped, TTL), then replay the exact stashed
// args through the inventory boundary with the captured precondition. The
// boundary revalidates the precondition in-transaction, so a stale approval
// (the item drifted underneath) 409s instead of blindly overwriting. No model
// round-trip — the result is deterministic.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const user = locals.user;

	const { confirmation_id } = await readJsonBody(request, ConfirmSchema);

	const action = claimPendingAction(confirmation_id, user.id);
	if (!action) {
		// Unknown, already used, foreign, or expired — all indistinguishable and
		// all mean "ask again".
		return json({ ok: false, expired: true, error: 'This request expired — ask again.' }, { status: 410 });
	}

	try {
		const result = await executeToolCall(action.toolName, action.args, db, user.id, undefined, action.precondition);
		const display = buildToolDisplay(db, action.toolName, action.args, result);
		if (!isOk(result)) {
			// Soft failure (e.g. the item was already gone) — surface it as a
			// non-fatal conflict the card can render.
			const message = (result as { error?: string } | null)?.error ?? "Couldn't complete that action.";
			return json({ ok: false, conflict: true, error: message, display }, { status: 409 });
		}
		return json({ ok: true, display });
	} catch (err) {
		if (err instanceof PreconditionConflictError) {
			return json(
				{ ok: false, conflict: true, error: 'That item changed since — nothing was done.' },
				{ status: 409 }
			);
		}
		console.error('[chat/confirm] execution error:', err);
		throw error(500, 'Failed to apply the confirmed action');
	}
};
