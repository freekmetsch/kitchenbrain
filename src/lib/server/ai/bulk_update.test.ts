import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb, type TestDb } from '$lib/server/test_db';
import { addInventory, updateInventory } from '$lib/server/workflows/inventory';
import { executeToolCall } from './executors';
import type { TurnExecutionContext } from './commit_risk';
import { claimPendingAction } from './pending_actions';
import { createTurnSafetyState } from './turn_safety';

function turnCtx(): TurnExecutionContext {
	return {
		createdThisTurn: new Set(),
		destructiveCount: 0,
		safety: createTurnSafetyState()
	};
}

type BulkResult = {
	ok: boolean;
	updated_count: number;
	failed_count: number;
	op_ids: number[];
};

function seedFreezer(db: TestDb, count = 4): number[] {
	const names = [
		'Kip',
		'Bonen',
		'Zalm',
		'Spinazie',
		'Rijst',
		'Pasta',
		'Melk',
		'Kaas',
		'Brood',
		'Eieren',
		'Boter'
	];
	return names.slice(0, count).map((name) =>
		addInventory(
			db,
			{ name, section: 'freezer', qtyNum: 1, unit: 'stuk' },
			{ actor: 'ai', userId: 1 }
		).item.id
	);
}

function itemById(db: TestDb, id: number) {
	return db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, id)).get()!;
}

async function proposeBatch(
	db: TestDb,
	updates: Array<Record<string, unknown>>,
	context = turnCtx()
) {
	await executeToolCall('get_inventory', {}, db, 1, context);
	const proposal = (await executeToolCall(
		'bulk_update_inventory',
		{ updates },
		db,
		1,
		context
	)) as {
		needs_confirmation?: boolean;
		confirmation_id?: string;
		action_diff?: unknown[];
	};
	return { proposal, context };
}

async function applyProposal(db: TestDb, confirmationId: string): Promise<BulkResult> {
	const action = claimPendingAction(confirmationId, 1);
	if (!action) throw new Error('pending action missing');
	return (await executeToolCall(
		action.toolName,
		action.args,
		db,
		1,
		undefined,
		action.precondition
	)) as BulkResult;
}

describe('bulk_update_inventory', () => {
	it('shows every row and writes nothing before approval', async () => {
		const db = createTestDb();
		const ids = seedFreezer(db);
		const beforeOps = db.select().from(schema.inventoryOpsLog).all().length;

		const { proposal } = await proposeBatch(
			db,
			ids.map((id) => ({ id, category: 'meat', kind: 'ingredient' }))
		);

		expect(proposal.needs_confirmation).toBe(true);
		expect(proposal.action_diff).toHaveLength(4);
		expect(proposal.action_diff?.[0]).toMatchObject({
			before: 'category: —, kind: —',
			after: 'category: meat, kind: ingredient'
		});
		expect(db.select().from(schema.inventoryOpsLog).all()).toHaveLength(beforeOps);
		for (const id of ids) expect(itemById(db, id).category).toBeNull();
	});

	it('commits every reviewed row atomically after approval', async () => {
		const db = createTestDb();
		const ids = seedFreezer(db);
		const { proposal } = await proposeBatch(
			db,
			ids.map((id) => ({ id, category: 'meat', kind: 'ingredient' }))
		);

		const result = await applyProposal(db, proposal.confirmation_id!);

		expect(result).toMatchObject({ ok: true, updated_count: 4, failed_count: 0 });
		expect(result.op_ids).toHaveLength(4);
		for (const id of ids) {
			expect(itemById(db, id)).toMatchObject({ category: 'meat', kind: 'ingredient' });
		}
	});

	it('commits none when one reviewed target drifts', async () => {
		const db = createTestDb();
		const ids = seedFreezer(db);
		const { proposal } = await proposeBatch(
			db,
			ids.map((id) => ({ id, qty_num: 9 }))
		);
		updateInventory(db, ids[1], { qtyNum: 7 }, { actor: 'testuser', userId: 1 });
		const beforeOps = db.select().from(schema.inventoryOpsLog).all().length;

		await expect(applyProposal(db, proposal.confirmation_id!)).rejects.toThrow(
			'changed since the approval'
		);
		expect(itemById(db, ids[0]).qtyNum).toBe(1);
		expect(itemById(db, ids[1]).qtyNum).toBe(7);
		expect(db.select().from(schema.inventoryOpsLog).all()).toHaveLength(beforeOps);
	});

	it('undoes all batch operations in one transaction', async () => {
		const db = createTestDb();
		const ids = seedFreezer(db);
		const { proposal } = await proposeBatch(
			db,
			ids.map((id) => ({ id, qty_num: 9 }))
		);
		const applied = await applyProposal(db, proposal.confirmation_id!);

		const undo = (await executeToolCall(
			'undo_op',
			{ op_ids: applied.op_ids },
			db,
			1
		)) as { ok: boolean; opIds: number[] };

		expect(undo.ok).toBe(true);
		expect(undo.opIds).toHaveLength(4);
		for (const id of ids) expect(itemById(db, id).qtyNum).toBe(1);
	});

	it('undoes none when one batch item changed after approval', async () => {
		const db = createTestDb();
		const ids = seedFreezer(db);
		const { proposal } = await proposeBatch(
			db,
			ids.map((id) => ({ id, qty_num: 9 }))
		);
		const applied = await applyProposal(db, proposal.confirmation_id!);
		updateInventory(db, ids[1], { qtyNum: 7 }, { actor: 'testuser', userId: 1 });
		const beforeOps = db.select().from(schema.inventoryOpsLog).all().length;

		await expect(
			executeToolCall('undo_op', { op_ids: applied.op_ids }, db, 1)
		).rejects.toThrow();
		expect(itemById(db, ids[0]).qtyNum).toBe(9);
		expect(itemById(db, ids[1]).qtyNum).toBe(7);
		expect(db.select().from(schema.inventoryOpsLog).all()).toHaveLength(beforeOps);
	});

	it('refuses batches above the phone-reviewable cap', async () => {
		const db = createTestDb();
		const ids = seedFreezer(db, 11);
		const context = turnCtx();
		await executeToolCall('get_inventory', {}, db, 1, context);
		const beforeOps = db.select().from(schema.inventoryOpsLog).all().length;

		const result = await executeToolCall(
			'bulk_update_inventory',
			{ updates: ids.map((id) => ({ id, qty_num: 9 })) },
			db,
			1,
			context
		);

		expect(result).toMatchObject({ ok: false, contract_error: 'invalid_input' });
		expect(db.select().from(schema.inventoryOpsLog).all()).toHaveLength(beforeOps);
	});
});
