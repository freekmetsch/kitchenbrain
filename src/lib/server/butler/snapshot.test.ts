import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { buildButlerSnapshot } from './snapshot';

describe('Butler household snapshot', () => {
	it('projects current household facts without changing the database', () => {
		const db = createTestDb();
		const now = new Date('2026-07-29T10:00:00Z');
		const recipe = db
			.insert(schema.recipes)
			.values({
				slug: 'lasagne',
				title: 'Lasagne',
				isFreezerStaple: true,
				targetPortions: 6,
				createdAt: now,
				updatedAt: now
			})
			.returning()
			.get();
		db.insert(schema.inventoryItems)
			.values([
				{
					name: 'Spinazie',
					section: 'pantry',
					expiryDate: '2026-07-31',
					createdAt: now,
					updatedAt: now
				},
				{
					name: 'Lasagne',
					qtyNum: 2,
					unit: 'portions',
					section: 'freezer',
					kind: 'leftover',
					madeFromRecipeId: recipe.id,
					createdAt: now,
					updatedAt: now
				},
				{
					name: 'Old deleted milk',
					section: 'pantry',
					expiryDate: '2026-07-30',
					deletedAt: now,
					createdAt: now,
					updatedAt: now
				}
			])
			.run();
		db.insert(schema.mealPlanMeals)
			.values({
				weekNumber: 31,
				weekStartDate: '2026-07-29',
				dinner: 'Lasagne',
				createdAt: now
			})
			.run();
		db.insert(schema.shoppingWeekEntries)
			.values([
				{
					weekStartDate: '2026-07-29',
					sourceKey: 'manual:milk',
					sourceKind: 'manual',
					name: 'melk',
					amount: '1',
					unit: 'l',
					createdAt: now,
					updatedAt: now
				},
				{
					weekStartDate: '2026-07-29',
					sourceKey: 'manual:tomatoes-a',
					sourceKind: 'manual',
					name: 'tomaten',
					amount: '2',
					unit: 'stuks',
					createdAt: now,
					updatedAt: now
				},
				{
					weekStartDate: '2026-07-29',
					sourceKey: 'manual:tomatoes-b',
					sourceKind: 'manual',
					name: 'tomaten',
					amount: '1',
					unit: 'blik',
					createdAt: now,
					updatedAt: now
				},
				{
					weekStartDate: '2026-07-29',
					sourceKey: 'legacy:rice',
					sourceKind: 'legacy',
					name: 'rijst',
					needsReview: true,
					createdAt: now,
					updatedAt: now
				}
			])
			.run();

		const before = db.get<{ total: number }>(sql`select total_changes() as total`)!.total;
		const snapshot = buildButlerSnapshot(db, { today: '2026-07-29', weekStartDay: 2 });
		const after = db.get<{ total: number }>(sql`select total_changes() as total`)!.total;

		expect(snapshot).toEqual({
			today: '2026-07-29',
			expiring: [
				{ id: expect.any(Number), name: 'Spinazie', expiryDate: '2026-07-31', section: 'pantry' }
			],
			plannedMeals: 1,
			shopping: { toBuy: 2, conflicts: 1, sourcesNeedingReview: 1 },
			freezerTargets: [
				{
					recipeSlug: 'lasagne',
					title: 'Lasagne',
					currentPortions: 2,
					targetPortions: 6
				}
			],
			pendingReviews: 0
		});
		expect(after).toBe(before);
	});
});
