// Dispatch coverage for the inventory executors — the chat agent's top write
// paths into stock. Drives the REAL executeToolCall against a throwaway
// in-memory DB: happy paths assert committed rows + the { ok } contract,
// rejection paths assert a clean { ok:false / error } result (never a throw),
// and the commit-risk gate (P5.3) is asserted honestly: pre-existing stock
// pauses for confirmation instead of executing.
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb, type TestDb } from '$lib/server/test_db';
import { addInventory } from '$lib/server/inventory_writes';
import { executeToolCall, isOk } from './index';
import type { TurnExecutionContext } from '../commit_risk';

const turnCtx = (): TurnExecutionContext => ({ createdThisTurn: new Set(), destructiveCount: 0 });

type AddResult = { ok: boolean; id: number; name: string; opId: number | null };
type RemoveResult = { ok: boolean; removed?: string; error?: string; opId?: number | null };
type UpdateResult = { ok: boolean; verified?: boolean; error?: string; opId?: number | null };
type UndoResult = { ok: boolean; error?: string };
type ConfirmResult = {
	needs_confirmation?: boolean;
	confirmation_id?: string;
	action_summary?: string;
};
type ErrorResult = { error?: string };

function seedItem(db: TestDb, name = 'Kipfilet') {
	return addInventory(
		db,
		{ name, section: 'freezer', qtyNum: 1, unit: 'stuks' },
		{ actor: 'ai', userId: 1 }
	);
}

function itemById(db: TestDb, id: number) {
	return db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, id)).get()!;
}

function allItems(db: TestDb) {
	return db.select().from(schema.inventoryItems).all();
}

describe('executeToolCall dispatch', () => {
	it('returns a clean error for an unknown tool name', async () => {
		const db = createTestDb();
		const res = (await executeToolCall('definitely_not_a_tool', {}, db, 1, turnCtx())) as ErrorResult;
		expect(res.error).toBe('Unknown tool: definitely_not_a_tool');
		expect(isOk(res)).toBe(false);
	});
});

describe('add_to_inventory', () => {
	it('creates a new item and tracks it as created this turn', async () => {
		const db = createTestDb();
		const ctx = turnCtx();

		const res = (await executeToolCall(
			'add_to_inventory',
			{ name: 'Kipfilet', section: 'freezer', qty_num: 2, unit: 'stuks', category: 'meat' },
			db,
			1,
			ctx
		)) as AddResult;

		expect(isOk(res)).toBe(true);
		expect(typeof res.id).toBe('number');
		expect(typeof res.opId).toBe('number');
		const row = itemById(db, res.id);
		expect(row.name).toBe('Kipfilet');
		expect(row.section).toBe('freezer');
		expect(row.qtyNum).toBe(2);
		expect(row.deletedAt).toBeNull();
		// Same-turn tracking makes a follow-up delete instant (commit-risk gate).
		expect(ctx.createdThisTurn.has(res.id)).toBe(true);
	});

	it('pauses for confirmation instead of merging into pre-existing stock', async () => {
		const db = createTestDb();
		const existing = seedItem(db).item;

		const res = (await executeToolCall(
			'add_to_inventory',
			{ name: 'Kipfilet', section: 'freezer', qty_num: 2 },
			db,
			1,
			turnCtx()
		)) as ConfirmResult;

		expect(res.needs_confirmation).toBe(true);
		expect(typeof res.confirmation_id).toBe('string');
		expect(res.action_summary).toContain('Kipfilet');
		expect(isOk(res)).toBe(false);
		// Nothing executed: still one row, quantity untouched.
		expect(allItems(db)).toHaveLength(1);
		expect(itemById(db, existing.id).qtyNum).toBe(1);
	});

	it('rejects malformed args with a clean error instead of throwing', async () => {
		const db = createTestDb();
		const res = (await executeToolCall(
			'add_to_inventory',
			{ name: 'Kipfilet' }, // missing required section
			db,
			1,
			turnCtx()
		)) as ErrorResult;
		expect(res.error).toMatch(/^Invalid input for section/);
		expect(allItems(db)).toHaveLength(0);
	});
});

describe('remove_from_inventory', () => {
	it('deletes an item the agent created this turn instantly (soft delete)', async () => {
		const db = createTestDb();
		const ctx = turnCtx();
		const added = (await executeToolCall(
			'add_to_inventory',
			{ name: 'Spinazie', section: 'freezer', qty_num: 1 },
			db,
			1,
			ctx
		)) as AddResult;

		const res = (await executeToolCall(
			'remove_from_inventory',
			{ id: added.id },
			db,
			1,
			ctx
		)) as RemoveResult;

		expect(isOk(res)).toBe(true);
		expect(res.removed).toBe('Spinazie');
		expect(itemById(db, added.id).deletedAt).not.toBeNull();
		// Committed destructive work feeds the bulk safety net.
		expect(ctx.destructiveCount).toBe(1);
	});

	it('pauses for confirmation when deleting pre-existing stock', async () => {
		const db = createTestDb();
		const existing = seedItem(db).item;

		const res = (await executeToolCall(
			'remove_from_inventory',
			{ id: existing.id },
			db,
			1,
			turnCtx()
		)) as ConfirmResult;

		expect(res.needs_confirmation).toBe(true);
		expect(typeof res.confirmation_id).toBe('string');
		// Nothing executed: the row is still live.
		expect(itemById(db, existing.id).deletedAt).toBeNull();
	});

	it('reports a clean error for an unknown item', async () => {
		const db = createTestDb();
		const res = (await executeToolCall(
			'remove_from_inventory',
			{ id: 999999 },
			db,
			1,
			turnCtx()
		)) as RemoveResult;
		expect(res.ok).toBe(false);
		expect(res.error).toBe('Item not found');
	});
});

describe('update_inventory_item', () => {
	it('updates fields and verifies the post-state', async () => {
		const db = createTestDb();
		const existing = seedItem(db).item;

		const res = (await executeToolCall(
			'update_inventory_item',
			{ id: existing.id, qty_num: 5, section: 'pantry', expiry_date: '2026-08-01' },
			db,
			1,
			turnCtx()
		)) as UpdateResult;

		expect(isOk(res)).toBe(true);
		expect(res.verified).toBe(true);
		expect(typeof res.opId).toBe('number');
		const row = itemById(db, existing.id);
		expect(row.qtyNum).toBe(5);
		expect(row.section).toBe('pantry');
		expect(row.expiryDate).toBe('2026-08-01');
	});

	it('reports a clean error for an unknown item', async () => {
		const db = createTestDb();
		const res = (await executeToolCall(
			'update_inventory_item',
			{ id: 999999, qty_num: 5 },
			db,
			1,
			turnCtx()
		)) as UpdateResult;
		expect(res.ok).toBe(false);
		expect(res.error).toBe('Item not found');
	});

	it('rejects malformed args with a clean error instead of throwing', async () => {
		const db = createTestDb();
		const res = (await executeToolCall(
			'update_inventory_item',
			{ id: 'not-a-number', qty_num: 5 },
			db,
			1,
			turnCtx()
		)) as ErrorResult;
		expect(res.error).toMatch(/^Invalid input for id/);
	});
});

describe('undo_op', () => {
	it('reverts an update back to the previous values', async () => {
		const db = createTestDb();
		const existing = seedItem(db).item;
		const upd = (await executeToolCall(
			'update_inventory_item',
			{ id: existing.id, qty_num: 7 },
			db,
			1,
			turnCtx()
		)) as UpdateResult;
		expect(itemById(db, existing.id).qtyNum).toBe(7);

		const undo = (await executeToolCall(
			'undo_op',
			{ op_id: upd.opId },
			db,
			1,
			turnCtx()
		)) as UndoResult;

		expect(undo.ok).toBe(true);
		expect(itemById(db, existing.id).qtyNum).toBe(1);
	});

	it('reverts an add by soft-deleting the created item', async () => {
		const db = createTestDb();
		const ctx = turnCtx();
		const added = (await executeToolCall(
			'add_to_inventory',
			{ name: 'Zalm', section: 'freezer', qty_num: 1 },
			db,
			1,
			ctx
		)) as AddResult;
		expect(itemById(db, added.id).deletedAt).toBeNull();

		const undo = (await executeToolCall('undo_op', { op_id: added.opId }, db, 1, ctx)) as UndoResult;

		expect(undo.ok).toBe(true);
		expect(itemById(db, added.id).deletedAt).not.toBeNull();
	});

	it('reverts a remove by restoring the soft-deleted item', async () => {
		const db = createTestDb();
		const existing = seedItem(db).item;
		// No turnCtx = non-chat caller: skips the confirmation gate and commits.
		const removed = (await executeToolCall(
			'remove_from_inventory',
			{ id: existing.id },
			db,
			1
		)) as RemoveResult;
		expect(removed.ok).toBe(true);
		expect(itemById(db, existing.id).deletedAt).not.toBeNull();

		const undo = (await executeToolCall(
			'undo_op',
			{ op_id: removed.opId },
			db,
			1,
			turnCtx()
		)) as UndoResult;

		expect(undo.ok).toBe(true);
		expect(itemById(db, existing.id).deletedAt).toBeNull();
	});

	it('reports a clean error for an unknown op id', async () => {
		const db = createTestDb();
		const res = (await executeToolCall('undo_op', { op_id: 999999 }, db, 1, turnCtx())) as UndoResult;
		expect(res.ok).toBe(false);
		expect(res.error).toBe('Op not found');
	});

	it('requires op_id or item_id', async () => {
		const db = createTestDb();
		const res = (await executeToolCall('undo_op', {}, db, 1, turnCtx())) as UndoResult;
		expect(res.ok).toBe(false);
		expect(res.error).toBe('Provide op_id (from get_inventory_history) or item_id');
	});
});
