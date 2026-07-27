import { describe, expect, it } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { createMealPlanService } from './meal-plan';

describe('meal-plan workflow', () => {
	it('normalizes the planning week and preserves the web freezer coercion', () => {
		const db = createTestDb();
		const mealPlan = createMealPlanService(db);

		const result = mealPlan.create({
			weekStartDate: '2026-07-03',
			dinner: 'Restjes',
			source: 'freezer',
			sourcePolicy: 'coerce-fresh'
		});

		expect(result).toMatchObject({
			ok: true,
			meal: {
				weekStartDate: '2026-07-01',
				dinner: 'Restjes',
				source: 'fresh',
				sortOrder: 0
			}
		});
		expect(db.select().from(schema.mealPlanMeals).all()).toHaveLength(1);
	});

	it('rolls back the meal when shopping reconciliation fails', () => {
		const db = createTestDb();
		const mealPlan = createMealPlanService(db, {
			reconcileShopping: () => {
				throw new Error('injected reconciliation fault');
			}
		});

		expect(() =>
			mealPlan.create({
				weekStartDate: '2026-07-01',
				dinner: 'Lasagne',
				sourcePolicy: 'coerce-fresh'
			})
		).toThrow('injected reconciliation fault');
		expect(db.select().from(schema.mealPlanMeals).all()).toHaveLength(0);
	});

	it('cooks and uncooks a planned recipe with matching log and recipe stats', () => {
		const db = createTestDb();
		const now = new Date();
		db.insert(schema.recipes)
			.values({
				slug: 'stamppot',
				title: 'Stamppot',
				ingredients: [],
				directions: [],
				createdAt: now,
				updatedAt: now
			})
			.run();
		const mealPlan = createMealPlanService(db);
		const planned = mealPlan.create({
			weekStartDate: '2026-07-01',
			dinner: 'Stamppot',
			recipeSlug: 'stamppot',
			sourcePolicy: 'coerce-fresh'
		});
		if (!planned.ok) throw new Error(planned.error);

		expect(mealPlan.cook(planned.meal.id, '2026-07-09').ok).toBe(true);
		expect(db.select().from(schema.cookLog).all()).toHaveLength(1);
		expect(db.select().from(schema.recipes).get()).toMatchObject({
			cookedCount: 1
		});

		expect(mealPlan.uncook(planned.meal.id).ok).toBe(true);
		expect(db.select().from(schema.cookLog).all()).toHaveLength(0);
		expect(db.select().from(schema.recipes).get()).toMatchObject({
			cookedCount: 0,
			lastCookedAt: null
		});
	});
});
