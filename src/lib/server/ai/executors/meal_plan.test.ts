// Dispatch coverage for the meal-plan executors: planning, removing, and
// cook-marking meals through the REAL executeToolCall against a throwaway
// in-memory DB. Cook-marking also asserts the downstream cook_log row and the
// recipe stats bump (recordCook), plus its meal-level idempotency.
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb, type TestDb } from '$lib/server/test_db';
import { isoWeekNumber } from '$lib/week';
import { executeToolCall, isOk } from './index';
import type { TurnExecutionContext } from '../commit_risk';

const turnCtx = (): TurnExecutionContext => ({ createdThisTurn: new Set(), destructiveCount: 0 });

const WEEK = '2026-07-06'; // a Monday

type PlanResult = { ok: boolean; id: number; week: string; dinner: string };
type RemoveResult = { ok: boolean; removed?: string; error?: string };
type CookedResult = { ok: boolean; meal?: string; cooked_date?: string; error?: string };
type ErrorResult = { error?: string };

function seedRecipe(db: TestDb, slug: string) {
	const now = new Date();
	return db
		.insert(schema.recipes)
		.values({ slug, title: slug, ingredients: [], directions: [], createdAt: now, updatedAt: now })
		.returning()
		.get();
}

function mealById(db: TestDb, id: number) {
	return db.select().from(schema.mealPlanMeals).where(eq(schema.mealPlanMeals.id, id)).get();
}

function allMeals(db: TestDb) {
	return db.select().from(schema.mealPlanMeals).all();
}

describe('plan_meal', () => {
	it('plans dinners into a week with incrementing sort order', async () => {
		const db = createTestDb();

		const first = (await executeToolCall(
			'plan_meal',
			{ week_start_date: WEEK, dinner: 'Lasagne', note: 'met vrienden' },
			db,
			1,
			turnCtx()
		)) as PlanResult;
		const second = (await executeToolCall(
			'plan_meal',
			{ week_start_date: WEEK, dinner: 'Stamppot' },
			db,
			1,
			turnCtx()
		)) as PlanResult;

		expect(isOk(first)).toBe(true);
		expect(first.week).toBe(WEEK);
		expect(first.dinner).toBe('Lasagne');

		const row1 = mealById(db, first.id)!;
		const row2 = mealById(db, second.id)!;
		expect(row1.weekStartDate).toBe(WEEK);
		expect(row1.weekNumber).toBe(isoWeekNumber(WEEK));
		expect(row1.note).toBe('met vrienden');
		expect(row1.status).toBe('planned');
		expect(row1.sortOrder).toBe(0);
		expect(row2.sortOrder).toBe(1);
	});

	it('rejects malformed args with a clean error instead of throwing', async () => {
		const db = createTestDb();
		const res = (await executeToolCall(
			'plan_meal',
			{ week_start_date: WEEK }, // missing required dinner
			db,
			1,
			turnCtx()
		)) as ErrorResult;
		expect(res.error).toMatch(/^Invalid input for dinner/);
		expect(allMeals(db)).toHaveLength(0);
	});
});

describe('remove_meal', () => {
	it('removes a planned meal', async () => {
		const db = createTestDb();
		const planned = (await executeToolCall(
			'plan_meal',
			{ week_start_date: WEEK, dinner: 'Lasagne' },
			db,
			1,
			turnCtx()
		)) as PlanResult;

		const res = (await executeToolCall(
			'remove_meal',
			{ id: planned.id },
			db,
			1,
			turnCtx()
		)) as RemoveResult;

		expect(isOk(res)).toBe(true);
		expect(res.removed).toBe('Lasagne');
		expect(mealById(db, planned.id)).toBeUndefined();
	});

	it('reports a clean error for an unknown meal', async () => {
		const db = createTestDb();
		const res = (await executeToolCall(
			'remove_meal',
			{ id: 999999 },
			db,
			1,
			turnCtx()
		)) as RemoveResult;
		expect(res.ok).toBe(false);
		expect(res.error).toBe('Meal not found');
	});
});

describe('mark_meal_cooked', () => {
	it('marks the meal cooked and logs the cook against the recipe', async () => {
		const db = createTestDb();
		const recipe = seedRecipe(db, 'stamppot');
		const planned = (await executeToolCall(
			'plan_meal',
			{ week_start_date: WEEK, dinner: 'Stamppot', recipe_slug: 'stamppot' },
			db,
			1,
			turnCtx()
		)) as PlanResult;

		const res = (await executeToolCall(
			'mark_meal_cooked',
			{ id: planned.id, cooked_date: '2026-07-09' },
			db,
			1,
			turnCtx()
		)) as CookedResult;

		expect(isOk(res)).toBe(true);
		expect(res.cooked_date).toBe('2026-07-09');
		const meal = mealById(db, planned.id)!;
		expect(meal.status).toBe('cooked');
		expect(meal.cookedDate).toBe('2026-07-09');

		const cooks = db
			.select()
			.from(schema.cookLog)
			.where(eq(schema.cookLog.mealPlanMealId, planned.id))
			.all();
		expect(cooks).toHaveLength(1);
		expect(cooks[0].recipeSlug).toBe('stamppot');
		expect(cooks[0].source).toBe('plan');

		const updatedRecipe = db
			.select()
			.from(schema.recipes)
			.where(eq(schema.recipes.id, recipe.id))
			.get()!;
		expect(updatedRecipe.cookedCount).toBe(1);
		expect(updatedRecipe.lastCookedAt).not.toBeNull();
	});

	it('marking the same meal twice does not double-log the cook', async () => {
		const db = createTestDb();
		seedRecipe(db, 'stamppot');
		const planned = (await executeToolCall(
			'plan_meal',
			{ week_start_date: WEEK, dinner: 'Stamppot', recipe_slug: 'stamppot' },
			db,
			1,
			turnCtx()
		)) as PlanResult;

		await executeToolCall('mark_meal_cooked', { id: planned.id, cooked_date: '2026-07-09' }, db, 1, turnCtx());
		const again = (await executeToolCall(
			'mark_meal_cooked',
			{ id: planned.id, cooked_date: '2026-07-10' },
			db,
			1,
			turnCtx()
		)) as CookedResult;

		expect(isOk(again)).toBe(true);
		const cooks = db
			.select()
			.from(schema.cookLog)
			.where(eq(schema.cookLog.mealPlanMealId, planned.id))
			.all();
		expect(cooks).toHaveLength(1);
	});

	it('reports a clean error for an unknown meal', async () => {
		const db = createTestDb();
		const res = (await executeToolCall(
			'mark_meal_cooked',
			{ id: 999999 },
			db,
			1,
			turnCtx()
		)) as CookedResult;
		expect(res.ok).toBe(false);
		expect(res.error).toBe('Meal not found');
	});
});
