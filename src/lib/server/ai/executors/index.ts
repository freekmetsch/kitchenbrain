import { z } from 'zod';
import { PreconditionConflictError, type WritePrecondition } from '$lib/server/inventory_writes';
import { classifyCommitRisk, type TurnExecutionContext } from '$lib/server/ai/commit_risk';
import { createPendingAction } from '$lib/server/ai/pending_actions';
import type { DB, ExecutorFn } from './shared';
import { inventoryExecutors } from './inventory';
import { mealPlanExecutors } from './meal_plan';
import { recipeExecutors } from './recipes';
import { shoppingExecutors } from './shopping';
import { miscExecutors } from './misc';

const domainMaps = [inventoryExecutors, mealPlanExecutors, recipeExecutors, shoppingExecutors, miscExecutors];

const executors: Record<string, ExecutorFn> = Object.assign({}, ...domainMaps);

// Spread-merging silently shadows on a duplicate key (the old monolith made it
// a TS error) — fail loudly at module load instead.
if (domainMaps.reduce((n, m) => n + Object.keys(m).length, 0) !== Object.keys(executors).length)
	throw new Error('duplicate executor key across domains');

/** Whether a tool/executor result is a success (`{ ok: true }`). */
export function isOk(result: unknown): boolean {
	return !!result && typeof result === 'object' && (result as { ok?: unknown }).ok === true;
}

export async function executeToolCall(
	name: string,
	input: unknown,
	db: DB,
	userId: number,
	turnCtx?: TurnExecutionContext,
	precondition?: WritePrecondition
): Promise<unknown> {
	const executor = executors[name];
	if (!executor) return { error: `Unknown tool: ${name}` };

	// Photo-derived recipes are review-biased (P5.4): vision hallucinates
	// quantities, timings, and roles, so a recipe saved on a turn that carried an
	// image is forced to needs_review regardless of what the model set. The prompt
	// asks for it; this guarantees it (edit_recipe has no such flag — one-shot
	// ingestion goes through add_recipe).
	if (turnCtx?.visionTurn && name === 'add_recipe' && input && typeof input === 'object') {
		const inp = input as Record<string, unknown>;
		inp.needs_review = true;
		if (typeof inp.review_reason !== 'string' || !inp.review_reason.trim()) {
			inp.review_reason =
				'Extracted from a photo — double-check quantities, timings, and ingredient names.';
		}
	}

	// Commit-risk gate (P5.3): a few destructive/merging ops pause for approval
	// instead of executing. The stashed action is committed out-of-band by
	// POST /api/chat/confirm (which re-enters here with a precondition and no
	// turnCtx). Non-chat callers pass neither and skip the gate.
	if (turnCtx) {
		const decision = classifyCommitRisk(name, input, turnCtx, db);
		if (decision.risk === 'confirm') {
			const confirmationId = createPendingAction({
				userId,
				toolName: name,
				args: input,
				precondition: decision.precondition,
				summary: decision.summary
			});
			return {
				needs_confirmation: true,
				confirmation_id: confirmationId,
				action_summary: decision.summary
			};
		}
	}

	try {
		const result = await executor(input, db, userId, precondition);
		// Track turn context for later risk decisions. Count only committed
		// destructive work (deferred proposals don't count) and remember what the
		// agent added this turn so deleting it stays instant.
		if (turnCtx && isOk(result)) {
			if (name === 'remove_from_inventory') turnCtx.destructiveCount++;
			else if (name === 'add_to_inventory') {
				const id = (result as { id?: unknown }).id;
				if (typeof id === 'number') turnCtx.createdThisTurn.add(id);
			}
		}
		return result;
	} catch (err) {
		// A stale-approval conflict must reach the /confirm handler as a 409,
		// not be flattened into a generic tool error.
		if (err instanceof PreconditionConflictError) throw err;
		// ZodError.message is the raw JSON issues array — it ends up user-visible in
		// the chat error chip AND in the model's tool_result, so flatten it to one
		// sentence the model can act on (field + what's wrong).
		if (err instanceof z.ZodError) {
			const first = err.issues[0];
			const path = first?.path?.length ? ` for ${first.path.join('.')}` : '';
			return { error: `Invalid input${path}: ${first?.message ?? 'malformed arguments'}` };
		}
		return { error: err instanceof Error ? err.message : 'Tool execution failed' };
	}
}
