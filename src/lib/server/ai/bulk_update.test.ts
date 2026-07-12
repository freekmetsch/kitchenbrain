// R3 stage-gate drill for bulk_update_inventory (P4) — also permanent regression
// coverage. Drives the REAL executor against a throwaway in-memory DB: proves
// many-in-one updates commit, partial failure is reported (successes stay
// committed), and every item stays individually undoable.
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb, type TestDb } from '$lib/server/test_db';
import { addInventory } from '$lib/server/inventory_writes';
import { executeToolCall } from './executors';
import type { TurnExecutionContext } from './commit_risk';

const turnCtx = (): TurnExecutionContext => ({ createdThisTurn: new Set(), destructiveCount: 0 });

type BulkResult = {
	ok: boolean;
	updated_count: number;
	failed_count: number;
	op_ids: number[];
};

function seedFreezer(db: TestDb): number[] {
	return ['Kipfilet', 'Rundergehakt', 'Zalm', 'Spinazie'].map(
		(name) =>
			addInventory(db, { name, section: 'freezer', qtyNum: 1, unit: 'stuks' }, { actor: 'ai', userId: 1 })
				.item.id
	);
}

function itemById(db: TestDb, id: number) {
	return db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, id)).get()!;
}

describe('bulk_update_inventory (R3 drill)', () => {
	it('reclassifies many items in one call, one undo op each', async () => {
		const db = createTestDb();
		const ids = seedFreezer(db);

		const res = (await executeToolCall(
			'bulk_update_inventory',
			{ updates: ids.map((id) => ({ id, category: 'meat', kind: 'ingredient' })) },
			db,
			1,
			turnCtx()
		)) as BulkResult;

		expect(res.ok).toBe(true);
		expect(res.updated_count).toBe(4);
		expect(res.failed_count).toBe(0);
		expect(res.op_ids).toHaveLength(4);
		for (const id of ids) {
			const it = itemById(db, id);
			expect(it.category).toBe('meat');
			expect(it.kind).toBe('ingredient');
		}
	});

	it('reports partial success and leaves the good writes committed', async () => {
		const db = createTestDb();
		const ids = seedFreezer(db);

		const res = (await executeToolCall(
			'bulk_update_inventory',
			{
				updates: [
					{ id: ids[0], qty_num: 5 },
					{ id: 999999, qty_num: 5 } // nonexistent -> fails
				]
			},
			db,
			1,
			turnCtx()
		)) as BulkResult;

		expect(res.ok).toBe(false);
		expect(res.updated_count).toBe(1);
		expect(res.failed_count).toBe(1);
		expect(itemById(db, ids[0]).qtyNum).toBe(5);
	});

	it('each bulk change is individually undoable via undo_op', async () => {
		const db = createTestDb();
		const ids = seedFreezer(db);

		const res = (await executeToolCall(
			'bulk_update_inventory',
			{ updates: ids.map((id) => ({ id, qty_num: 9 })) },
			db,
			1,
			turnCtx()
		)) as BulkResult;
		expect(itemById(db, ids[0]).qtyNum).toBe(9);

		const undo = (await executeToolCall('undo_op', { op_id: res.op_ids[0] }, db, 1, turnCtx())) as {
			ok: boolean;
		};
		expect(undo.ok).toBe(true);
		// First item reverted to its seeded qty; the others still show the bulk value.
		expect(itemById(db, ids[0]).qtyNum).toBe(1);
		expect(itemById(db, ids[1]).qtyNum).toBe(9);
	});
});
