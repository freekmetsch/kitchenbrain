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
});
