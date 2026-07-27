import { describe, expect, it } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { reconcileShoppingAfterWrite } from './reconcile-shopping';

describe('shopping reconciliation workflow', () => {
	it('participates in its caller transaction without committing a nested transaction', () => {
		const db = createTestDb();
		const now = new Date();
		db.insert(schema.householdPrefs)
			.values({ key: 'shopping.source_entries.v1', value: 'complete', updatedAt: now })
			.run();
		const recipe = db
			.insert(schema.recipes)
			.values({
				slug: 'rollback-curry',
				title: 'Rollback curry',
				ingredients: [{ id: 'rice', name: 'rijst', amount: '200', unit: 'g' }],
				directions: [],
				createdAt: now,
				updatedAt: now
			})
			.returning()
			.get();

		expect(() =>
			db.transaction((tx) => {
				tx.insert(schema.mealPlanMeals)
					.values({
						weekNumber: 30,
						weekStartDate: '2026-07-22',
						dinner: 'Rollback curry',
						recipeSlug: recipe.slug,
						sortOrder: 0,
						createdAt: now
					})
					.run();
				reconcileShoppingAfterWrite(tx, ['2026-07-22'], {
					today: '2026-07-22'
				});
				throw new Error('rollback');
			})
		).toThrow('rollback');

		expect(db.select().from(schema.mealPlanMeals).all()).toEqual([]);
		expect(db.select().from(schema.shoppingWeekEntries).all()).toEqual([]);
	});
});
