import { afterEach, describe, expect, it, vi } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { createMealPlanService } from './meal-plan';
import { rotationShortlistForWeek } from './meal-rotation';
import { initializeShoppingSourceData } from './reconcile-shopping';

afterEach(() => vi.useRealTimers());

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

	it('rejects new planned references to an archived recipe', () => {
		const db = createTestDb();
		const now = new Date();
		db.insert(schema.recipes)
			.values({
				slug: 'archived-soup',
				title: 'Archived soup',
				servings: 4,
				ingredients: [],
				directions: [],
				archivedAt: now,
				createdAt: now,
				updatedAt: now
			})
			.run();

		expect(
			createMealPlanService(db).create({
				weekStartDate: '2026-08-05',
				dinner: 'Archived soup',
				recipeSlug: 'archived-soup',
				sourcePolicy: 'coerce-fresh'
			})
		).toMatchObject({ ok: false, code: 'recipe_unavailable' });
		expect(db.select().from(schema.mealPlanMeals).all()).toEqual([]);
	});

	it('rejects planned-serving writes for past and cooked meals before reconciling shopping', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-03T10:00:00.000Z'));
		const db = createTestDb();
		const reconcileShopping = vi.fn();
		const mealPlan = createMealPlanService(db, { reconcileShopping });
		const past = mealPlan.create({
			weekStartDate: '2026-07-22',
			dinner: 'Past soup',
			servings: 4,
			sourcePolicy: 'coerce-fresh'
		});
		const current = mealPlan.create({
			weekStartDate: '2026-07-29',
			dinner: 'Cooked soup',
			servings: 4,
			sourcePolicy: 'coerce-fresh'
		});
		if (!past.ok || !current.ok) throw new Error('fixture meal missing');
		expect(mealPlan.cook(current.meal.id, '2026-08-03').ok).toBe(true);
		reconcileShopping.mockClear();

		expect(mealPlan.setPlannedServings(past.meal.id, 6)).toMatchObject({
			ok: false,
			code: 'past_week'
		});
		expect(mealPlan.setPlannedServings(current.meal.id, 6)).toMatchObject({
			ok: false,
			code: 'already_cooked'
		});
		expect(
			db.select({ servings: schema.mealPlanMeals.servings }).from(schema.mealPlanMeals).all()
		).toEqual([{ servings: 4 }, { servings: 4 }]);
		expect(reconcileShopping).not.toHaveBeenCalled();
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

	it('recomputes a rotation candidate inside the planning transaction', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-03T10:00:00.000Z'));
		const db = createTestDb();
		const now = new Date();
		db.insert(schema.recipes)
			.values({
				slug: 'bolo',
				title: 'Spaghetti bolognese',
				servings: 4,
				ingredients: [],
				directions: [],
				rotationPolicy: 'weekly',
				lastCookedAt: new Date('2026-07-01T12:00:00.000Z'),
				createdAt: now,
				updatedAt: now
			})
			.run();
		const weekStartDate = '2026-07-29';
		const candidate = rotationShortlistForWeek(db, weekStartDate, weekStartDate).due[0];
		const mealPlan = createMealPlanService(db);

		const result = mealPlan.createFromRotation({
			weekStartDate,
			recipeSlug: candidate.slug,
			candidateKey: candidate.key
		});

		expect(result).toMatchObject({
			ok: true,
			meal: { recipeSlug: 'bolo', source: 'fresh', servings: 4 }
		});
	});

	it('returns fresh candidates instead of planning when source evidence changed', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-03T10:00:00.000Z'));
		const db = createTestDb();
		const now = new Date();
		const recipe = db
			.insert(schema.recipes)
			.values({
				slug: 'soep',
				title: 'Soup',
				servings: 2,
				ingredients: [],
				directions: [],
				rotationPolicy: 'weekly',
				lastCookedAt: new Date('2026-07-01T12:00:00.000Z'),
				createdAt: now,
				updatedAt: now
			})
			.returning()
			.get();
		const weekStartDate = '2026-07-29';
		const stale = rotationShortlistForWeek(db, weekStartDate, weekStartDate).due[0];
		db.insert(schema.inventoryItems)
			.values({
				name: 'Soup portions',
				qtyNum: 3,
				section: 'freezer',
				kind: 'leftover',
				madeFromRecipeId: recipe.id,
				createdAt: now,
				updatedAt: now
			})
			.run();

		const result = createMealPlanService(db).createFromRotation({
			weekStartDate,
			recipeSlug: stale.slug,
			candidateKey: stale.key
		});

		expect(result).toMatchObject({ ok: false, code: 'rotation_drift' });
		expect(db.select().from(schema.mealPlanMeals).all()).toEqual([]);
	});

	it('keeps Cook on full Dutch ingredients and Use freezer on serve-fresh ingredients', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-03T10:00:00.000Z'));
		const db = createTestDb();
		const now = new Date();
		const [freshRecipe, freezerRecipe] = db
			.insert(schema.recipes)
			.values([
				{
					slug: 'verse-soep',
					title: 'Verse soep',
					servings: 2,
					ingredients: [
						{ id: 'fresh-tomaat', name: 'tomaat', amount: '4', role: 'cook_in' },
						{ id: 'fresh-brood', name: 'brood', amount: '1', role: 'serve_fresh' }
					],
					directions: [],
					rotationPolicy: 'weekly',
					lastCookedAt: new Date('2026-07-01'),
					createdAt: now,
					updatedAt: now
				},
				{
					slug: 'vries-soep',
					title: 'Vries-soep',
					servings: 2,
					ingredients: [
						{ id: 'freezer-tomaat', name: 'tomaat', amount: '4', role: 'cook_in' },
						{ id: 'freezer-brood', name: 'brood', amount: '1', role: 'serve_fresh' }
					],
					directions: [],
					rotationPolicy: 'weekly',
					lastCookedAt: new Date('2026-07-01'),
					createdAt: now,
					updatedAt: now
				}
			])
			.returning()
			.all();
		db.insert(schema.inventoryItems)
			.values({
				name: 'Vries-soep porties',
				qtyNum: 3,
				section: 'freezer',
				kind: 'leftover',
				madeFromRecipeId: freezerRecipe.id,
				createdAt: now,
				updatedAt: now
			})
			.run();
		const weekStartDate = '2026-07-29';
		initializeShoppingSourceData(db);
		const shortlist = rotationShortlistForWeek(db, weekStartDate, weekStartDate);
		const service = createMealPlanService(db);
		for (const candidate of shortlist.due.filter((row) =>
			[freshRecipe.id, freezerRecipe.id].includes(row.id)
		)) {
			expect(
				service.createFromRotation({
					weekStartDate,
					recipeSlug: candidate.slug,
					candidateKey: candidate.key
				}).ok
			).toBe(true);
		}

		const entries = db
			.select({ recipeSlug: schema.shoppingWeekEntries.recipeSlug, name: schema.shoppingWeekEntries.name })
			.from(schema.shoppingWeekEntries)
			.all();
		expect(entries.filter((entry) => entry.recipeSlug === 'verse-soep').map((entry) => entry.name).sort()).toEqual([
			'brood',
			'tomaat'
		]);
		expect(entries.filter((entry) => entry.recipeSlug === 'vries-soep').map((entry) => entry.name)).toEqual([
			'brood'
		]);
	});
});
