import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { moveDefrostedItemToFridge, undoDefrostMove } from './defrost-action';

function setup() {
	const db = createTestDb();
	const now = new Date('2026-07-29T10:00:00.000Z');
	const item = db
		.insert(schema.inventoryItems)
		.values({
			name: 'Lasagne',
			section: 'freezer',
			kind: 'leftover',
			qtyNum: 2,
			unit: 'portion',
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();
	return { db, item, now };
}

describe('defrost completion', () => {
	it('moves the reviewed freezer snapshot to the fridge and can undo the exact op', () => {
		const { db, item, now } = setup();
		const moved = moveDefrostedItemToFridge(
			db,
			{ itemId: item.id, expectedUpdatedAt: now.toISOString() },
			{ actor: 'testuser', userId: 1 }
		);

		expect(moved).toMatchObject({
			ok: true,
			item: { id: item.id, section: 'fridge' },
			opId: expect.any(Number)
		});
		expect(
			db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, item.id)).get()
		).toMatchObject({ section: 'fridge' });

		const undone = undoDefrostMove(db, moved.opId!, {
			actor: 'testuser',
			userId: 1
		});
		expect(undone).toMatchObject({ ok: true, item: { section: 'freezer' } });
	});

	it('blocks stale and non-freezer completion without writing', () => {
		const { db, item } = setup();

		expect(() =>
			moveDefrostedItemToFridge(
				db,
				{ itemId: item.id, expectedUpdatedAt: '2026-07-29T09:00:00.000Z' },
				{ actor: 'testuser', userId: 1 }
			)
		).toThrow(/changed/i);
		expect(db.select().from(schema.inventoryOpsLog).all()).toHaveLength(0);

		db.update(schema.inventoryItems)
			.set({ section: 'pantry' })
			.where(eq(schema.inventoryItems.id, item.id))
			.run();
		expect(() =>
			moveDefrostedItemToFridge(
				db,
				{ itemId: item.id, expectedUpdatedAt: item.updatedAt.toISOString() },
				{ actor: 'testuser', userId: 1 }
			)
		).toThrow(/freezer/i);
		expect(db.select().from(schema.inventoryOpsLog).all()).toHaveLength(0);
	});
});
