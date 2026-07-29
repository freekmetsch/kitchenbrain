import { z } from 'zod';
import {
	PreconditionConflictError,
	type WritePrecondition
} from '$lib/server/domains/inventory/commands';
import { classifyCommitRisk, type TurnExecutionContext } from '$lib/server/ai/commit_risk';
import { createPendingAction } from '$lib/server/ai/pending_actions';
import type { DB, ExecutorFn } from './shared';
import { inventoryExecutors } from './inventory';
import { mealPlanExecutors } from './meal_plan';
import { recipeExecutors } from './recipes';
import { shoppingExecutors } from './shopping';
import { ahExecutors } from './ah';
import {
	ContractError,
	authorizeToolCall,
	createTurnSafetyState,
	failedCallKey,
	isPersistentTool,
	observeToolResult
} from '$lib/server/ai/turn_safety';

const domainMaps = [
	inventoryExecutors,
	mealPlanExecutors,
	recipeExecutors,
	shoppingExecutors,
	ahExecutors
];

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
	precondition?: WritePrecondition | WritePrecondition[]
): Promise<unknown> {
	const executor = executors[name];
	if (!executor) return { error: `Unknown tool: ${name}` };
	const safety = turnCtx
		? (turnCtx.safety ??= createTurnSafetyState())
		: undefined;
	const failureKey = turnCtx ? failedCallKey(name, input) : null;
	const memoized = failureKey ? safety?.failedCalls.get(failureKey) : undefined;
	if (memoized !== undefined) return memoized;

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
				turnCtx.locale === 'nl'
					? 'Uit een foto gehaald — controleer hoeveelheden, tijden en namen van ingrediënten.'
					: 'Extracted from a photo — double-check quantities, timings, and ingredient names.';
		}
	}

	// Commit-risk gate (P5.3): a few destructive/merging ops pause for approval
	// instead of executing. The stashed action is committed out-of-band by
	// POST /api/chat/confirm (which re-enters here with a precondition and no
	// turnCtx). Non-chat callers pass neither and skip the gate.
	let authorizedPrecondition = precondition;
	try {
		if (turnCtx) {
			authorizedPrecondition = authorizeToolCall(name, input, db, safety!);
		}
	} catch (err) {
		if (turnCtx && err instanceof ContractError) {
			safety!.writeLatched = true;
			const result = {
				ok: false,
				error: err.message,
				contract_error: err.code,
				write_latched: true
			};
			if (failureKey) safety!.failedCalls.set(failureKey, result);
			return result;
		}
		throw err;
	}

	if (turnCtx) {
		const decision = classifyCommitRisk(name, input, turnCtx, db, authorizedPrecondition);
		if (decision.risk === 'confirm') {
			const confirmationId = createPendingAction({
				userId,
				toolName: name,
				args: input,
				precondition: decision.precondition,
				summary: decision.summary,
				diff: decision.diff
			});
			return {
				needs_confirmation: true,
				confirmation_id: confirmationId,
				action_summary: decision.summary,
				...(decision.diff ? { action_diff: decision.diff } : {})
			};
		}
	}

	try {
		const result = await executor(input, db, userId, authorizedPrecondition, safety);
		// Track turn context for later risk decisions. Count only committed
		// destructive work (deferred proposals don't count) and remember what the
		// agent added this turn so deleting it stays instant.
		if (turnCtx && isOk(result)) {
			if (name === 'remove_from_inventory') turnCtx.destructiveCount++;
			else if (name === 'add_to_inventory') {
				const id = (result as { id?: unknown }).id;
				if (typeof id === 'number') turnCtx.createdThisTurn.add(id);
			}
			if (isPersistentTool(name)) safety!.committedWrites.push(name);
		}
		if (turnCtx) observeToolResult(name, result, db, safety!);
		return result;
	} catch (err) {
		if (err instanceof ContractError) {
			if (!turnCtx) throw err;
			safety!.writeLatched = true;
			const result = {
				ok: false,
				error: err.message,
				contract_error: err.code,
				write_latched: true
			};
			if (failureKey) safety!.failedCalls.set(failureKey, result);
			return result;
		}
		// A stale-approval conflict must reach the /confirm handler as a 409,
		// not be flattened into a generic tool error.
		if (err instanceof PreconditionConflictError) {
			if (!turnCtx) throw err;
			const contract = new ContractError('stale_target', err.message);
			safety!.writeLatched = true;
			const result = {
				ok: false,
				error: contract.message,
				contract_error: contract.code,
				write_latched: true
			};
			if (failureKey) safety!.failedCalls.set(failureKey, result);
			return result;
		}
		// ZodError.message is the raw JSON issues array — it ends up user-visible in
		// the chat error chip AND in the model's tool_result, so flatten it to one
		// sentence the model can act on (field + what's wrong).
		if (err instanceof z.ZodError) {
			const first = err.issues[0];
			const path = first?.path?.length ? ` for ${first.path.join('.')}` : '';
			const result = {
				ok: false,
				error: `Invalid input${path}: ${first?.message ?? 'malformed arguments'}`,
				contract_error: 'invalid_input',
				write_latched: Boolean(turnCtx)
			};
			if (turnCtx) {
				safety!.writeLatched = true;
				if (failureKey) safety!.failedCalls.set(failureKey, result);
			}
			return result;
		}
		return { error: err instanceof Error ? err.message : 'Tool execution failed' };
	}
}
