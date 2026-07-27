import { desc, eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type { DbOrTx } from '$lib/server/db/types';
import type { BenchSheetRating } from '$lib/types';
import { getMealPlanMeal, type MealPlanMeal } from './queries';

export type CookSource = 'plan' | 'manual' | 'backfill' | 'meal';

export type CreateMealPlanInput = {
	weekNumber: number;
	weekStartDate: string;
	dinner: string;
	recipeSlug: string | null;
	servings: number | null;
	plannedDate?: string | null;
	source: 'fresh' | 'freezer';
	note?: string | null;
};

export function createMealPlanMeal(db: DbOrTx, input: CreateMealPlanInput): MealPlanMeal {
	const existing = db
		.select({ sortOrder: schema.mealPlanMeals.sortOrder })
		.from(schema.mealPlanMeals)
		.where(eq(schema.mealPlanMeals.weekStartDate, input.weekStartDate))
		.orderBy(desc(schema.mealPlanMeals.sortOrder))
		.get();
	return db
		.insert(schema.mealPlanMeals)
		.values({
			...input,
			sortOrder: (existing?.sortOrder ?? -1) + 1,
			createdAt: new Date()
		})
		.returning()
		.get();
}

export type UpdateMealPlanMetadataInput = Partial<{
	plannedDate: string | null;
	source: 'fresh' | 'freezer';
	servings: number | null;
}>;

export type MealPlanMutationResult =
	| { ok: true; meal: MealPlanMeal }
	| { ok: false; code: 'not_found' | 'source_requires_recipe'; error: string };

export function updateMealPlanMetadata(
	db: DbOrTx,
	id: number,
	input: UpdateMealPlanMetadataInput
): MealPlanMutationResult {
	if (input.source === 'freezer') {
		const current = getMealPlanMeal(db, id);
		if (!current) return { ok: false, code: 'not_found', error: 'Meal not found' };
		if (!current.recipeSlug) {
			return {
				ok: false,
				code: 'source_requires_recipe',
				error: 'Only meals linked to a recipe can be served from the freezer'
			};
		}
	}
	const meal = db
		.update(schema.mealPlanMeals)
		.set(input)
		.where(eq(schema.mealPlanMeals.id, id))
		.returning()
		.get();
	return meal
		? { ok: true, meal }
		: { ok: false, code: 'not_found', error: 'Meal not found' };
}

export function setMealPlanStatus(
	db: DbOrTx,
	id: number,
	status: 'planned' | 'cooked',
	cookedDate: string | null
): MealPlanMutationResult {
	const meal = db
		.update(schema.mealPlanMeals)
		.set({ status, cookedDate })
		.where(eq(schema.mealPlanMeals.id, id))
		.returning()
		.get();
	return meal
		? { ok: true, meal }
		: { ok: false, code: 'not_found', error: 'Meal not found' };
}

export function deleteMealPlanMeal(db: DbOrTx, id: number): boolean {
	return db.delete(schema.mealPlanMeals).where(eq(schema.mealPlanMeals.id, id)).run().changes > 0;
}

export function insertCookLog(
	db: DbOrTx,
	input: {
		recipeId: number | null;
		recipeSlug: string | null;
		cookedDate: string;
		source: CookSource;
		mealPlanMealId?: number | null;
		benchSheetRating?: BenchSheetRating | null;
	}
) {
	return db
		.insert(schema.cookLog)
		.values({
			...input,
			cookedAt: new Date(`${input.cookedDate}T12:00:00.000Z`),
			mealPlanMealId: input.mealPlanMealId ?? null,
			benchSheetRating: input.benchSheetRating ?? null,
			createdAt: new Date()
		})
		.returning()
		.get();
}

export function deleteCookLogsForMeal(db: DbOrTx, mealPlanMealId: number): number {
	return db
		.delete(schema.cookLog)
		.where(eq(schema.cookLog.mealPlanMealId, mealPlanMealId))
		.run().changes;
}

export function insertMealLog(
	db: DbOrTx,
	input: {
		date: string;
		recipeSlug: string | null;
		notes: string | null;
		rating: number | null;
	}
) {
	return db
		.insert(schema.mealLog)
		.values({ ...input, createdAt: new Date() })
		.returning()
		.get();
}
