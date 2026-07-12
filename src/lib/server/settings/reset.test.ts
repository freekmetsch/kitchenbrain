import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb, type TestDb } from '../test_db';
import { RESET_GROUP_KEYS, RESET_GROUPS, countGroupRows, resetGroup } from './reset';

const NOW = new Date();

function seedRecipe(db: TestDb, slug: string) {
	return db
		.insert(schema.recipes)
		.values({ slug, title: slug, createdAt: NOW, updatedAt: NOW })
		.run().lastInsertRowid as number;
}

function seedInventoryItem(db: TestDb, name: string, madeFromRecipeId: number | null = null) {
	return db
		.insert(schema.inventoryItems)
		.values({ name, section: 'freezer', madeFromRecipeId, createdAt: NOW, updatedAt: NOW })
		.run().lastInsertRowid as number;
}

describe('RESET_GROUP_KEYS / RESET_GROUPS', () => {
	it('every key has a label and description', () => {
		for (const key of RESET_GROUP_KEYS) {
			expect(RESET_GROUPS[key].label.length).toBeGreaterThan(0);
			expect(RESET_GROUPS[key].description.length).toBeGreaterThan(0);
		}
	});

	it('never includes the un-resettable tables', () => {
		const labels = RESET_GROUP_KEYS.map((k) => RESET_GROUPS[k].label.toLowerCase());
		expect(labels.join(' ')).not.toMatch(/\busers\b|\bsessions\b|\bhousehold_prefs\b|\bprefs\b/);
	});
});

describe('resetGroup(inventory)', () => {
	it('deletes inventory_items and inventory_ops_log, nulling self-referencing undo_of first', () => {
		const db = createTestDb();
		const itemId = seedInventoryItem(db, 'Kipfilet');
		const firstOp = db
			.insert(schema.inventoryOpsLog)
			.values({ userId: 1, opType: 'add', itemId, createdAt: NOW })
			.run().lastInsertRowid as number;
		// Second op undoes the first — this is the self-referencing FK that must
		// be nulled before either row can be deleted.
		db.insert(schema.inventoryOpsLog)
			.values({ userId: 1, opType: 'remove', itemId, undoOf: firstOp, createdAt: NOW })
			.run();

		expect(() => resetGroup(db, 'inventory')).not.toThrow();

		expect(db.select().from(schema.inventoryItems).all()).toHaveLength(0);
		expect(db.select().from(schema.inventoryOpsLog).all()).toHaveLength(0);
	});

	it('reports accurate deleted counts', () => {
		const db = createTestDb();
		seedInventoryItem(db, 'A');
		seedInventoryItem(db, 'B');
		const result = resetGroup(db, 'inventory');
		expect(result.deleted.inventory_items).toBe(2);
	});

	it('does not touch recipes', () => {
		const db = createTestDb();
		const recipeId = seedRecipe(db, 'stamppot');
		seedInventoryItem(db, 'Leftover stamppot', recipeId);
		resetGroup(db, 'inventory');
		expect(db.select().from(schema.recipes).all()).toHaveLength(1);
	});
});

describe('resetGroup(recipes)', () => {
	it('deletes recipes and cascades meal_sub_recipes', () => {
		const db = createTestDb();
		const mealId = seedRecipe(db, 'taco-avond');
		const subId = seedRecipe(db, 'gehakt-vulling');
		db.insert(schema.mealSubRecipes)
			.values({ mealRecipeId: mealId, subRecipeId: subId, createdAt: NOW })
			.run();

		resetGroup(db, 'recipes');

		expect(db.select().from(schema.recipes).all()).toHaveLength(0);
		expect(db.select().from(schema.mealSubRecipes).all()).toHaveLength(0);
	});

	it('nulls inbound FKs from inventory_items and cook_log instead of failing', () => {
		const db = createTestDb();
		const recipeId = seedRecipe(db, 'soep');
		const itemId = seedInventoryItem(db, 'Leftover soep', recipeId);
		db.insert(schema.cookLog)
			.values({ recipeId, cookedAt: NOW, cookedDate: '2026-07-12', source: 'manual', createdAt: NOW })
			.run();

		expect(() => resetGroup(db, 'recipes')).not.toThrow();

		const item = db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, itemId)).get()!;
		expect(item.madeFromRecipeId).toBeNull();
		const log = db.select().from(schema.cookLog).all()[0];
		expect(log.recipeId).toBeNull();
		// Neither table is part of the "recipes" group — rows themselves survive.
		expect(db.select().from(schema.inventoryItems).all()).toHaveLength(1);
		expect(db.select().from(schema.cookLog).all()).toHaveLength(1);
	});
});

describe('resetGroup(meal_history)', () => {
	it('deletes cook_log before meal_plan_meals (FK-safe order) plus meal_log', () => {
		const db = createTestDb();
		const mealPlanId = db
			.insert(schema.mealPlanMeals)
			.values({ weekNumber: 1, weekStartDate: '2026-07-06', dinner: 'Soep', createdAt: NOW })
			.run().lastInsertRowid as number;
		db.insert(schema.cookLog)
			.values({
				mealPlanMealId: mealPlanId,
				cookedAt: NOW,
				cookedDate: '2026-07-12',
				source: 'plan',
				createdAt: NOW
			})
			.run();
		db.insert(schema.mealLog).values({ date: '2026-07-12', createdAt: NOW }).run();

		expect(() => resetGroup(db, 'meal_history')).not.toThrow();

		expect(db.select().from(schema.cookLog).all()).toHaveLength(0);
		expect(db.select().from(schema.mealPlanMeals).all()).toHaveLength(0);
		expect(db.select().from(schema.mealLog).all()).toHaveLength(0);
	});
});

describe('resetGroup(shopping_data)', () => {
	it('deletes shopping_list_overrides and cascades shopping_push_items via shopping_push_history', () => {
		const db = createTestDb();
		db.insert(schema.shoppingListOverrides)
			.values({ weekStartDate: '2026-07-06', name: 'Melk', createdAt: NOW })
			.run();
		const pushId = db
			.insert(schema.shoppingPushHistory)
			.values({ weekStartDate: '2026-07-06', destination: 'list', createdAt: NOW })
			.run().lastInsertRowid as number;
		db.insert(schema.shoppingPushItems)
			.values({
				pushId,
				sourceRef: 'melk',
				sourceName: 'Melk',
				mode: 'freetext',
				destination: 'list',
				status: 'success',
				createdAt: NOW
			})
			.run();

		expect(() => resetGroup(db, 'shopping_data')).not.toThrow();

		expect(db.select().from(schema.shoppingListOverrides).all()).toHaveLength(0);
		expect(db.select().from(schema.shoppingPushHistory).all()).toHaveLength(0);
		expect(db.select().from(schema.shoppingPushItems).all()).toHaveLength(0);
	});
});

describe('resetGroup(chat_history / spending_log / ah_favorites)', () => {
	it('each deletes only its own table', () => {
		const db = createTestDb();
		db.insert(schema.chatMessages).values({ userId: 1, role: 'user', content: 'hoi', createdAt: NOW }).run();
		db.insert(schema.spending)
			.values({ date: '2026-07-12', model: 'z-ai/glm-5', inputTokens: 1, outputTokens: 1, costEur: 0.001, createdAt: NOW })
			.run();
		db.insert(schema.ahFavorites)
			.values({ nameKey: 'knoflook', productId: '123', productName: 'Go-Tan knoflook', createdAt: NOW })
			.run();

		resetGroup(db, 'chat_history');
		resetGroup(db, 'spending_log');
		resetGroup(db, 'ah_favorites');

		expect(db.select().from(schema.chatMessages).all()).toHaveLength(0);
		expect(db.select().from(schema.spending).all()).toHaveLength(0);
		expect(db.select().from(schema.ahFavorites).all()).toHaveLength(0);
	});
});

describe('countGroupRows', () => {
	it('reflects current row counts per group', () => {
		const db = createTestDb();
		seedInventoryItem(db, 'A');
		seedInventoryItem(db, 'B');
		seedRecipe(db, 'soep');
		const counts = countGroupRows(db);
		expect(counts.inventory).toBe(2);
		expect(counts.recipes).toBe(1);
		expect(counts.chat_history).toBe(0);
	});
});
