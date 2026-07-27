import { describe, expect, it } from 'vitest';
import { eq, isNull, sql } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { consumeRecipe } from './consume-recipe';
import { freezeRecipe } from './freeze-recipe';

function insertRecipe(db: ReturnType<typeof createTestDb>, slug = 'hachee') {
	const now = new Date();
	return db
		.insert(schema.recipes)
		.values({
			slug,
			title: 'Hachee',
			servings: 4,
			ingredients: [],
			directions: [],
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();
}

function insertLeftovers(
	db: ReturnType<typeof createTestDb>,
	recipe: ReturnType<typeof insertRecipe>,
	quantities: number[]
) {
	return db
		.insert(schema.inventoryItems)
		.values(
			quantities.map((qtyNum, index) => {
				const timestamp = new Date(Date.UTC(2026, 6, index + 1, 10));
				return {
					name: recipe.title,
					section: 'freezer' as const,
					kind: 'leftover' as const,
					qtyNum,
					unit: 'portion',
					madeFromRecipeId: recipe.id,
					recipeStatus: 'linked' as const,
					createdAt: timestamp,
					updatedAt: timestamp
				};
			})
		)
		.returning()
		.all();
}

describe('recipe stock workflows', () => {
	it('freezes portions into a recipe-linked leftover and returns the HTTP payload', () => {
		const db = createTestDb();
		const recipe = insertRecipe(db);

		const result = freezeRecipe(
			db,
			{ slug: recipe.slug, portions: 3 },
			{ actor: 'testuser', userId: 1 }
		);

		expect(result).toMatchObject({
			action: 'add',
			item: {
				name: 'Hachee',
				section: 'freezer',
				kind: 'leftover',
				qtyNum: 3,
				unit: 'portion',
				madeFromRecipeId: recipe.id,
				recipeStatus: 'linked'
			}
		});
		expect(
			db
				.select()
				.from(schema.inventoryItems)
				.where(isNull(schema.inventoryItems.deletedAt))
				.all()
		).toHaveLength(1);
		expect(db.select().from(schema.inventoryOpsLog).all()).toHaveLength(1);
		expect(
			db.select().from(schema.recipes).where(eq(schema.recipes.id, recipe.id)).get()
		).toMatchObject({ isFreezerStaple: true, targetPortions: 4 });
	});

	it('consumes recipe leftovers oldest first and returns the HTTP payload', () => {
		const db = createTestDb();
		const recipe = insertRecipe(db);
		const [oldest, newest] = insertLeftovers(db, recipe, [2, 4]);

		const result = consumeRecipe(
			db,
			{ slug: recipe.slug, portions: 3 },
			{ actor: 'testuser', userId: 1 }
		);

		expect(result).toEqual({ ok: true, consumed: 3, remaining: 3 });
		expect(
			db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, oldest.id)).get()
				?.deletedAt
		).toBeInstanceOf(Date);
		expect(
			db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, newest.id)).get()
		).toMatchObject({ qtyNum: 3, deletedAt: null });
		expect(db.select().from(schema.inventoryOpsLog).all()).toHaveLength(2);
	});

	it('succeeds with the available portion count when stock is insufficient', () => {
		const db = createTestDb();
		const recipe = insertRecipe(db);
		freezeRecipe(
			db,
			{ slug: recipe.slug, portions: 2 },
			{ actor: 'testuser', userId: 1 }
		);

		const result = consumeRecipe(
			db,
			{ slug: recipe.slug, portions: 5 },
			{ actor: 'testuser', userId: 1 }
		);

		expect(result).toEqual({ ok: true, consumed: 2, remaining: 0 });
		expect(
			db
				.select()
				.from(schema.inventoryItems)
				.where(isNull(schema.inventoryItems.deletedAt))
				.all()
		).toHaveLength(0);
	});

	it('merges repeated freezes into the same recipe-linked leftover', () => {
		const db = createTestDb();
		const recipe = insertRecipe(db);
		const ctx = { actor: 'testuser' as const, userId: 1 };

		freezeRecipe(db, { slug: recipe.slug, portions: 2 }, ctx);
		const result = freezeRecipe(db, { slug: recipe.slug, portions: 3 }, ctx);

		expect(result).toMatchObject({ action: 'update', item: { qtyNum: 5 } });
		expect(
			db
				.select()
				.from(schema.inventoryItems)
				.where(isNull(schema.inventoryItems.deletedAt))
				.all()
		).toHaveLength(1);
		expect(db.select().from(schema.inventoryOpsLog).all()).toHaveLength(2);
	});

	it('reports a missing recipe without changing inventory', () => {
		const db = createTestDb();
		const ctx = { actor: 'testuser' as const, userId: 1 };

		expect(freezeRecipe(db, { slug: 'missing', portions: 2 }, ctx)).toBeUndefined();
		expect(consumeRecipe(db, { slug: 'missing', portions: 2 }, ctx)).toBeUndefined();
		expect(db.select().from(schema.inventoryItems).all()).toHaveLength(0);
		expect(db.select().from(schema.inventoryOpsLog).all()).toHaveLength(0);
	});

	it('rolls back a freeze when inventory logging fails', () => {
		const db = createTestDb();
		const recipe = insertRecipe(db);
		db.run(sql.raw(`
			CREATE TRIGGER fail_inventory_log
			BEFORE INSERT ON inventory_ops_log
			BEGIN
				SELECT RAISE(ABORT, 'injected inventory log failure');
			END
		`));

		expect(() =>
			freezeRecipe(
				db,
				{ slug: recipe.slug, portions: 2 },
				{ actor: 'testuser', userId: 1 }
			)
		).toThrow('injected inventory log failure');

		expect(db.select().from(schema.inventoryItems).all()).toHaveLength(0);
		expect(db.select().from(schema.inventoryOpsLog).all()).toHaveLength(0);
		expect(
			db.select().from(schema.recipes).where(eq(schema.recipes.id, recipe.id)).get()
		).toMatchObject({ isFreezerStaple: false, targetPortions: null });
	});

	it('rolls back every leftover mutation when consumption fails midway', () => {
		const db = createTestDb();
		const recipe = insertRecipe(db);
		const [oldest, newest] = insertLeftovers(db, recipe, [2, 4]);
		db.run(sql.raw(`
			CREATE TRIGGER fail_second_inventory_log
			BEFORE INSERT ON inventory_ops_log
			WHEN (SELECT COUNT(*) FROM inventory_ops_log) >= 1
			BEGIN
				SELECT RAISE(ABORT, 'injected second inventory log failure');
			END
		`));

		expect(() =>
			consumeRecipe(
				db,
				{ slug: recipe.slug, portions: 3 },
				{ actor: 'testuser', userId: 1 }
			)
		).toThrow('injected second inventory log failure');

		expect(
			db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, oldest.id)).get()
		).toMatchObject({ qtyNum: 2, deletedAt: null });
		expect(
			db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, newest.id)).get()
		).toMatchObject({ qtyNum: 4, deletedAt: null });
		expect(db.select().from(schema.inventoryOpsLog).all()).toHaveLength(0);
	});
});
