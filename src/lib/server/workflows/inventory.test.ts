import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { addInventory as addInventoryCommand } from '$lib/server/domains/inventory/commands';
import { createTestDb } from '$lib/server/test_db';
import { createInventoryService } from './inventory';

describe('inventory service', () => {
	it('keeps an inventory write and its public history view behind one boundary', () => {
		const inventory = createInventoryService(createTestDb());

		const added = inventory.add(
			{ name: 'Kipfilet', section: 'freezer', qtyNum: 2, unit: 'stuks' },
			{ actor: 'alice', userId: 1 }
		);

		expect(added).toMatchObject({
			action: 'add',
			item: { name: 'Kipfilet', section: 'freezer', qtyNum: 2, unit: 'stuk' },
			verified: true
		});
		expect(inventory.history({ itemId: added.item.id })).toMatchObject([
			{
				opType: 'add',
				actorLabel: 'Alice',
				itemId: added.item.id,
				itemName: 'Kipfilet',
				undoable: true
			}
		]);
	});

	it('rolls back the item, history, and auto-staple recipe change together', () => {
		const db = createTestDb();
		const recipe = db
			.insert(schema.recipes)
			.values({
				slug: 'hachee',
				title: 'Hachee',
				servings: 4,
				ingredients: [],
				directions: [],
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.returning()
			.get();

		expect(() =>
			db.transaction((tx) => {
				addInventoryCommand(
					tx,
					{
						name: 'Hachee',
						section: 'freezer',
						kind: 'leftover',
						qtyNum: 6,
						unit: 'portion',
						madeFromRecipeId: recipe.id
					},
					{ actor: 'alice', userId: 1 }
				);
				throw new Error('injected fault');
			})
		).toThrow('injected fault');

		expect(db.select().from(schema.inventoryItems).all()).toHaveLength(0);
		expect(db.select().from(schema.inventoryOpsLog).all()).toHaveLength(0);
		expect(
			db.select().from(schema.recipes).where(eq(schema.recipes.id, recipe.id)).get()
		).toMatchObject({
			isFreezerStaple: false,
			targetPortions: null
		});
	});

	it('stores fridge items and round-trips pantry targets through undo', () => {
		const inventory = createInventoryService(createTestDb());
		const milk = inventory.add(
			{ name: 'Melk', section: 'fridge', qtyNum: 1, unit: 'l' },
			{ actor: 'alice', userId: 1 }
		);
		expect(milk.item).toMatchObject({ name: 'Melk', section: 'fridge' });

		const rice = inventory.add(
			{ name: 'Rijst', section: 'pantry', qtyNum: 1, unit: 'pak' },
			{ actor: 'alice', userId: 1 }
		);
		const changed = inventory.update(
			rice.item.id,
			{ parTargetQty: 3, parTargetUnit: 'pakken' },
			{ actor: 'alice', userId: 1 }
		);
		expect(changed).toMatchObject({
			ok: true,
			item: { parTargetQty: 3, parTargetUnit: 'pak', isStaple: true }
		});
		if (!changed.ok || changed.opId === null) throw new Error('Expected an undoable target update');

		expect(inventory.undo(changed.opId, { actor: 'alice', userId: 1 })).toMatchObject({
			ok: true,
			item: { parTargetQty: null, parTargetUnit: null, isStaple: false }
		});
	});

	it('rejects target drift unless the same reviewed update clears it', () => {
		const inventory = createInventoryService(createTestDb());
		const rice = inventory.add(
			{ name: 'Rijst', section: 'pantry', qtyNum: 1, unit: 'pak' },
			{ actor: 'alice', userId: 1 }
		);
		expect(
			inventory.update(
				rice.item.id,
				{ parTargetQty: 3, parTargetUnit: 'pak' },
				{ actor: 'alice', userId: 1 }
			)
		).toMatchObject({ ok: true });

		expect(
			inventory.update(rice.item.id, { section: 'fridge' }, { actor: 'alice', userId: 1 })
		).toEqual({ ok: false, error: 'Par targets are only available for pantry items.' });
		expect(
			inventory.update(rice.item.id, { unit: 'kg' }, { actor: 'alice', userId: 1 })
		).toEqual({ ok: false, error: 'Current quantity and par target units must match.' });

		expect(
			inventory.update(
				rice.item.id,
				{ section: 'fridge', parTargetQty: null, parTargetUnit: null },
				{ actor: 'alice', userId: 1 }
			)
		).toMatchObject({
			ok: true,
			item: { section: 'fridge', parTargetQty: null, parTargetUnit: null, isStaple: true }
		});
	});
});
