// Shared read of the inventory op-log as an enriched, human-readable timeline.
// One implementation behind the P2.3 history endpoint (GET /api/inventory/history)
// AND the chat agent's get_inventory_history tool (P5.5), so both speak the same
// language and compute undoability identically. Pure formatters live in
// $lib/inventory_history; this is the server-side query that feeds them.
import { desc, eq, isNotNull } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';
import {
	actorLabel,
	isUndoable,
	snapshotName,
	summarizeOp,
	type OpSnapshot,
	type OpType
} from '$lib/inventory_history';

type DB = BetterSQLite3Database<typeof schema>;

export type InventoryHistoryEvent = {
	id: number;
	opType: OpType;
	actorLabel: string;
	itemId: number | null;
	itemName: string;
	summary: string;
	createdAt: number;
	isUndo: boolean;
	undoable: boolean;
};

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 200;

/** Recent op-log entries (optionally scoped to one item), newest first. */
export function listInventoryHistory(
	db: DB,
	opts: { itemId?: number | null; limit?: number } = {}
): InventoryHistoryEvent[] {
	const itemId = opts.itemId ?? null;
	const limit = Number.isFinite(opts.limit)
		? Math.min(Math.max(opts.limit as number, 1), MAX_LIMIT)
		: DEFAULT_LIMIT;

	const rows = db
		.select({
			id: schema.inventoryOpsLog.id,
			opType: schema.inventoryOpsLog.opType,
			actor: schema.inventoryOpsLog.actor,
			itemId: schema.inventoryOpsLog.itemId,
			before: schema.inventoryOpsLog.beforeSnapshot,
			after: schema.inventoryOpsLog.afterSnapshot,
			undoOf: schema.inventoryOpsLog.undoOf,
			createdAt: schema.inventoryOpsLog.createdAt,
			currentName: schema.inventoryItems.name
		})
		.from(schema.inventoryOpsLog)
		.leftJoin(schema.inventoryItems, eq(schema.inventoryOpsLog.itemId, schema.inventoryItems.id))
		.where(itemId !== null ? eq(schema.inventoryOpsLog.itemId, itemId) : isNotNull(schema.inventoryOpsLog.id))
		.orderBy(desc(schema.inventoryOpsLog.id))
		.limit(limit)
		.all();

	// Ops already compensated by a later undo (undo_of → them) are no longer undoable.
	const undone = new Set<number>(
		db
			.select({ undoOf: schema.inventoryOpsLog.undoOf })
			.from(schema.inventoryOpsLog)
			.where(isNotNull(schema.inventoryOpsLog.undoOf))
			.all()
			.map((r) => r.undoOf)
			.filter((v): v is number => v !== null)
	);

	return rows.map((r) => {
		const before = r.before as OpSnapshot;
		const after = r.after as OpSnapshot;
		const opType = r.opType as OpType;
		const createdAt =
			r.createdAt instanceof Date ? r.createdAt.getTime() : new Date(r.createdAt).getTime();
		return {
			id: r.id,
			opType,
			actorLabel: actorLabel(r.actor),
			itemId: r.itemId,
			itemName: r.currentName ?? snapshotName(before, after),
			summary: summarizeOp(opType, before, after, r.undoOf),
			createdAt,
			isUndo: r.undoOf !== null,
			undoable: isUndoable(opType, before, after) && !r.undoOf && !undone.has(r.id)
		};
	});
}
