// Commit-risk classifier for the chat agent (P5.3).
//
// Most tool calls execute instantly — undo is the primary safety net. Three
// cases are genuinely destructive or lossy enough to pause for a one-tap
// approval instead (see PHASE5_AGENT_REWORK_PLAN.md Stage 2):
//   1. remove of an item that existed BEFORE this chat turn;
//   2. add that would MERGE into pre-existing stock (readonly pre-match);
//   3. more than a handful of destructive ops committed in one turn (safety net
//      for a runaway delete of items the agent itself just created).
// Everything else stays `free`. When `confirm`, we also capture the exact
// current state of the target so the approval endpoint can refuse a stale
// approval (the item changed underneath) rather than blindly overwrite it.
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';
import { isKind, type Kind } from '$lib/food_class';
import { qtyLabel } from '$lib/inventory_history';
import { findExistingItem } from '$lib/server/inventory_merge';
import { resolveInventoryTarget, toSnapshot, type WritePrecondition } from '$lib/server/inventory_writes';

type DB = BetterSQLite3Database<typeof schema>;

/** Threaded through one chat request's tool loop; feeds the risk decisions. */
export type TurnExecutionContext = {
	/** Item ids the agent added earlier in THIS turn — deleting them stays instant. */
	createdThisTurn: Set<number>;
	/** Destructive ops actually committed this turn (drives the bulk safety net). */
	destructiveCount: number;
	/** This turn carried an attached image — forces photo-derived recipes to review (P5.4). */
	visionTurn?: boolean;
};

export type CommitRiskDecision =
	| { risk: 'free' }
	| { risk: 'confirm'; reason: string; summary: string; precondition: WritePrecondition };

// 4th+ destructive op committed in a single turn trips the bulk gate.
const BULK_DESTRUCTIVE_THRESHOLD = 3;

function str(v: unknown): string | undefined {
	return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
function num(v: unknown): number | undefined {
	return typeof v === 'number' ? v : undefined;
}
function section(v: unknown): 'freezer' | 'pantry' | undefined {
	return v === 'freezer' || v === 'pantry' ? v : undefined;
}

export function classifyCommitRisk(
	name: string,
	rawInput: unknown,
	turnCtx: TurnExecutionContext,
	db: DB
): CommitRiskDecision {
	const input = (rawInput && typeof rawInput === 'object' ? rawInput : {}) as Record<string, unknown>;

	if (name === 'remove_from_inventory') {
		const target = resolveInventoryTarget(db, {
			id: num(input.id),
			name: str(input.name),
			section: section(input.section)
		});
		// A soft-deleted target (already gone) needs no confirmation.
		const item = target && !target.deletedAt ? target : undefined;
		if (!item) return { risk: 'free' }; // executor will report "not found"
		const bulk = turnCtx.destructiveCount >= BULK_DESTRUCTIVE_THRESHOLD;
		// Deleting something the agent just added this turn is instant (with undo),
		// unless the turn has already committed a suspicious number of deletions.
		if (turnCtx.createdThisTurn.has(item.id) && !bulk) return { risk: 'free' };
		const snapshot = toSnapshot(item);
		const q = qtyLabel(snapshot);
		const label = `${item.name}${q ? ` (${q})` : ''}`;
		const summary = bulk
			? `Delete ${label}? That's several deletions in one go.`
			: `Delete ${label} from the ${item.section}?`;
		return {
			risk: 'confirm',
			reason: bulk ? 'bulk_destructive' : 'delete_existing',
			summary,
			precondition: { itemId: item.id, expectedSnapshot: snapshot }
		};
	}

	if (name === 'add_to_inventory') {
		const itemName = str(input.name);
		const sec = section(input.section);
		if (!itemName || !sec) return { risk: 'free' };
		const kindRaw = str(input.kind);
		const kind: Kind | null = kindRaw && isKind(kindRaw) ? kindRaw : null;
		const match = findExistingItem(db, {
			name: itemName,
			section: sec,
			kind,
			madeFromRecipeId: num(input.made_from_recipe_id) ?? null
		});
		if (!match) return { risk: 'free' };
		// Merging into stock the agent itself just added this turn is its own batch
		// — no need to interrupt for that.
		if (turnCtx.createdThisTurn.has(match.item.id)) return { risk: 'free' };
		const snapshot = toSnapshot(match.item);
		const existingQty = qtyLabel(snapshot);
		const summary = `Add to your existing ${match.item.name}${existingQty ? ` (currently ${existingQty})` : ''} — combine into one entry?`;
		return {
			risk: 'confirm',
			reason: 'merge_existing',
			summary,
			precondition: { itemId: match.item.id, expectedSnapshot: snapshot }
		};
	}

	return { risk: 'free' };
}
