import type { Db } from '$lib/server/db/types';
import {
	PreconditionConflictError,
	toSnapshot,
	type WriteCtx
} from '$lib/server/domains/inventory/commands';
import { getInventoryItem } from '$lib/server/domains/inventory/queries';
import { undoOp, updateInventory } from './inventory';

export function moveDefrostedItemToFridge(
	db: Db,
	input: { itemId: number; expectedUpdatedAt: string },
	ctx: WriteCtx
) {
	const item = getInventoryItem(db, input.itemId);
	if (!item || item.deletedAt) throw new PreconditionConflictError('That freezer item is no longer available.');
	if (item.section !== 'freezer') {
		throw new PreconditionConflictError('That item is no longer recorded in the freezer.');
	}
	if (item.updatedAt.toISOString() !== input.expectedUpdatedAt) {
		throw new PreconditionConflictError('That freezer item changed since this review was prepared.');
	}
	const result = updateInventory(
		db,
		item.id,
		{ section: 'fridge' },
		ctx,
		{ itemId: item.id, expectedSnapshot: toSnapshot(item) }
	);
	if (!result.ok) throw new PreconditionConflictError(result.error);
	return result;
}

export function undoDefrostMove(db: Db, opId: number, ctx: WriteCtx) {
	return undoOp(db, opId, ctx);
}
