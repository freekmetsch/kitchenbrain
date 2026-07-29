import { and, asc, desc, eq, gte, isNull, lt, max, count, or } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type { DbOrTx } from '$lib/server/db/types';
import { weekKeyRange } from '$lib/week';

export type MealPlanMeal = typeof schema.mealPlanMeals.$inferSelect;

export function getMealPlanMeal(db: DbOrTx, id: number): MealPlanMeal | undefined {
	return db.select().from(schema.mealPlanMeals).where(eq(schema.mealPlanMeals.id, id)).get();
}

export function listMealPlanMeals(db: DbOrTx): MealPlanMeal[] {
	return db
		.select()
		.from(schema.mealPlanMeals)
		.orderBy(asc(schema.mealPlanMeals.weekStartDate), asc(schema.mealPlanMeals.sortOrder))
		.all();
}

export function listMissedPlannedMeals(
	db: DbOrTx,
	input: { today: string; currentWeekStart: string }
): MealPlanMeal[] {
	return db
		.select()
		.from(schema.mealPlanMeals)
		.where(
			and(
				eq(schema.mealPlanMeals.status, 'planned'),
				or(
					lt(schema.mealPlanMeals.plannedDate, input.today),
					and(
						isNull(schema.mealPlanMeals.plannedDate),
						lt(schema.mealPlanMeals.weekStartDate, input.currentWeekStart)
					)
				)
			)
		)
		.orderBy(
			asc(schema.mealPlanMeals.plannedDate),
			asc(schema.mealPlanMeals.weekStartDate),
			asc(schema.mealPlanMeals.sortOrder)
		)
		.all();
}

export function listMealsForWeek(db: DbOrTx, weekStart: string): MealPlanMeal[] {
	const range = weekKeyRange(weekStart);
	return db
		.select()
		.from(schema.mealPlanMeals)
		.where(
			and(
				gte(schema.mealPlanMeals.weekStartDate, range.from),
				lt(schema.mealPlanMeals.weekStartDate, range.to)
			)
		)
		.orderBy(asc(schema.mealPlanMeals.sortOrder))
		.all();
}

export function listMealsForWeekUnordered(
	db: DbOrTx,
	weekStart: string
): MealPlanMeal[] {
	const range = weekKeyRange(weekStart);
	return db
		.select()
		.from(schema.mealPlanMeals)
		.where(
			and(
				gte(schema.mealPlanMeals.weekStartDate, range.from),
				lt(schema.mealPlanMeals.weekStartDate, range.to)
			)
		)
		.all();
}

export function listMealsForWeekInSourceOrder(
	db: DbOrTx,
	weekStart: string
): MealPlanMeal[] {
	const range = weekKeyRange(weekStart);
	return db
		.select()
		.from(schema.mealPlanMeals)
		.where(
			and(
				gte(schema.mealPlanMeals.weekStartDate, range.from),
				lt(schema.mealPlanMeals.weekStartDate, range.to)
			)
		)
		.orderBy(
			asc(schema.mealPlanMeals.sortOrder),
			asc(schema.mealPlanMeals.id)
		)
		.all();
}

export function findCookLogForMeal(db: DbOrTx, mealPlanMealId: number) {
	return db
		.select({ id: schema.cookLog.id })
		.from(schema.cookLog)
		.where(eq(schema.cookLog.mealPlanMealId, mealPlanMealId))
		.get();
}

export function findManualCookForDate(db: DbOrTx, recipeSlug: string, cookedDate: string) {
	return db
		.select({ id: schema.cookLog.id })
		.from(schema.cookLog)
		.where(
			and(
				eq(schema.cookLog.recipeSlug, recipeSlug),
				eq(schema.cookLog.cookedDate, cookedDate),
				eq(schema.cookLog.source, 'manual')
			)
		)
		.get();
}

export function cookLogRecipeIdsForMeal(db: DbOrTx, mealPlanMealId: number): Array<number | null> {
	return db
		.select({ recipeId: schema.cookLog.recipeId })
		.from(schema.cookLog)
		.where(eq(schema.cookLog.mealPlanMealId, mealPlanMealId))
		.all()
		.map((row) => row.recipeId);
}

export function cookStatsForRecipe(db: DbOrTx, recipeId: number) {
	const stats = db
		.select({ latest: max(schema.cookLog.cookedAt), n: count() })
		.from(schema.cookLog)
		.where(eq(schema.cookLog.recipeId, recipeId))
		.get();
	return {
		lastCookedAt: stats?.latest ? new Date(Number(stats.latest)) : null,
		cookedCount: stats?.n ?? 0
	};
}

export function listRecentMealLog(db: DbOrTx, limit = 20) {
	return db
		.select({
			date: schema.mealLog.date,
			slug: schema.mealLog.recipeSlug,
			notes: schema.mealLog.notes
		})
		.from(schema.mealLog)
		.orderBy(desc(schema.mealLog.date))
		.limit(limit)
		.all();
}
