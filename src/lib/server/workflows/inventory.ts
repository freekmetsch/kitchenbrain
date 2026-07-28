import { db as appDb } from '$lib/server/db/index';
import type { Db } from '$lib/server/db/types';
import { listInventoryHistory } from '$lib/server/domains/inventory/history';
import { getInventoryItem } from '$lib/server/domains/inventory/queries';
import {
	addInventory as addInventoryCommand,
	removeInventory as removeInventoryCommand,
	setReviewFlag as setReviewFlagCommand,
	undoLatestRemoveForItem as undoLatestRemoveForItemCommand,
	undoOp as undoOpCommand,
	undoOps as undoOpsCommand,
	updateInventory as updateInventoryCommand,
	updateInventoryBatch as updateInventoryBatchCommand,
	type AddInventoryInput,
	type AddInventoryResult,
	type RemoveInventoryTarget,
	type RemoveInventoryResult,
	type ReviewFlagResult,
	type UndoResult,
	type UndoBatchResult,
	type UpdateInventoryBatchItem,
	type UpdateInventoryBatchResult,
	type UpdateInventoryInput,
	type UpdateInventoryResult,
	type WriteCtx,
	type WritePrecondition
} from '$lib/server/domains/inventory/commands';

export function addInventory(
	db: Db,
	input: AddInventoryInput,
	ctx: WriteCtx,
	precondition?: WritePrecondition
): AddInventoryResult {
	return db.transaction((tx) => addInventoryCommand(tx, input, ctx, precondition));
}

export function updateInventory(
	db: Db,
	id: number,
	input: UpdateInventoryInput,
	ctx: WriteCtx,
	precondition?: WritePrecondition
): UpdateInventoryResult {
	return db.transaction((tx) => updateInventoryCommand(tx, id, input, ctx, precondition));
}

export function updateInventoryBatch(
	db: Db,
	updates: UpdateInventoryBatchItem[],
	ctx: WriteCtx
): UpdateInventoryBatchResult {
	return db.transaction((tx) => updateInventoryBatchCommand(tx, updates, ctx));
}

export function removeInventory(
	db: Db,
	target: RemoveInventoryTarget,
	ctx: WriteCtx,
	precondition?: WritePrecondition
): RemoveInventoryResult {
	return db.transaction((tx) => removeInventoryCommand(tx, target, ctx, precondition));
}

export function undoOp(db: Db, opId: number, ctx: WriteCtx): UndoResult {
	return db.transaction((tx) => undoOpCommand(tx, opId, ctx));
}

export function undoOps(db: Db, opIds: number[], ctx: WriteCtx): UndoBatchResult {
	return db.transaction((tx) => undoOpsCommand(tx, opIds, ctx));
}

export function undoLatestRemoveForItem(db: Db, itemId: number, ctx: WriteCtx): UndoResult {
	return db.transaction((tx) => undoLatestRemoveForItemCommand(tx, itemId, ctx));
}

export function setReviewFlag(
	db: Db,
	itemId: number,
	reason: string | null,
	ctx: WriteCtx,
	precondition?: WritePrecondition
): ReviewFlagResult {
	return db.transaction((tx) => setReviewFlagCommand(tx, itemId, reason, ctx, precondition));
}

export function createInventoryService(db: Db) {
	return {
		add: (input: AddInventoryInput, ctx: WriteCtx, precondition?: WritePrecondition) =>
			addInventory(db, input, ctx, precondition),
		update: (
			id: number,
			input: UpdateInventoryInput,
			ctx: WriteCtx,
			precondition?: WritePrecondition
		) => updateInventory(db, id, input, ctx, precondition),
		updateBatch: (updates: UpdateInventoryBatchItem[], ctx: WriteCtx) =>
			updateInventoryBatch(db, updates, ctx),
		remove: (target: RemoveInventoryTarget, ctx: WriteCtx, precondition?: WritePrecondition) =>
			removeInventory(db, target, ctx, precondition),
		undo: (opId: number, ctx: WriteCtx) => undoOp(db, opId, ctx),
		undoMany: (opIds: number[], ctx: WriteCtx) => undoOps(db, opIds, ctx),
		undoLatestRemove: (itemId: number, ctx: WriteCtx) =>
			undoLatestRemoveForItem(db, itemId, ctx),
		setReviewFlag: (
			itemId: number,
			reason: string | null,
			ctx: WriteCtx,
			precondition?: WritePrecondition
		) => setReviewFlag(db, itemId, reason, ctx, precondition),
		get: getInventoryItem.bind(null, db),
		history: listInventoryHistory.bind(null, db)
	};
}

export const inventoryService = createInventoryService(appDb);
