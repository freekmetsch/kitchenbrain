import { eq, max, count } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './db/schema';
import { subRecipesOf } from './meal_recipes';
import type { BenchSheetRating } from '$lib/types';

type DB = BetterSQLite3Database<typeof schema>;

type CookSource = 'plan' | 'manual' | 'backfill' | 'meal';

export type { BenchSheetRating };

function recomputeRecipeStats(db: DB, recipeId: number) {
	const stats = db
		.select({ latest: max(schema.cookLog.cookedAt), n: count() })
		.from(schema.cookLog)
		.where(eq(schema.cookLog.recipeId, recipeId))
		.get();

	const latestMs = stats?.latest;
	db.update(schema.recipes)
		.set({
			lastCookedAt: latestMs ? new Date(Number(latestMs)) : null,
			cookedCount: stats?.n ?? 0,
			updatedAt: new Date()
		})
		.where(eq(schema.recipes.id, recipeId))
		.run();
}

export function recordCook(
	db: DB,
	opts: {
		recipeSlug: string | null;
		cookedDate: string; // ISO date YYYY-MM-DD
		source: CookSource;
		mealPlanMealId?: number | null;
		benchSheetRating?: BenchSheetRating | null;
	}
) {
	const { recipeSlug, cookedDate, source, mealPlanMealId = null, benchSheetRating = null } = opts;

	const recipe = recipeSlug
		? db.select({ id: schema.recipes.id }).from(schema.recipes).where(eq(schema.recipes.slug, recipeSlug)).get()
		: null;

	// Idempotency: if this meal_plan row was already logged, skip.
	if (mealPlanMealId != null) {
		const existing = db
			.select({ id: schema.cookLog.id })
			.from(schema.cookLog)
			.where(eq(schema.cookLog.mealPlanMealId, mealPlanMealId))
			.get();
		if (existing) return { logged: false, reason: 'already_logged' as const };
	}

	const cookedAt = new Date(`${cookedDate}T12:00:00.000Z`);
	db.insert(schema.cookLog)
		.values({
			recipeId: recipe?.id ?? null,
			recipeSlug: recipeSlug ?? null,
			cookedAt,
			cookedDate,
			source,
			mealPlanMealId,
			benchSheetRating,
			createdAt: new Date()
		})
		.run();

	if (recipe) {
		recomputeRecipeStats(db, recipe.id);
		// ADR 0003 dual bump: cooking a Meal Recipe genuinely cooked each
		// sub-recipe, so each gets its own cook_log row (source 'meal') and a
		// stats recompute. Sub rows share the mealPlanMealId so unrecordCook
		// removes the whole set in one delete. Guarded on source so the
		// recursion depth is one (subs can't be meals by invariant anyway).
		if (source !== 'meal') {
			const cookedAtDate = new Date(`${cookedDate}T12:00:00.000Z`);
			for (const sub of subRecipesOf(db, recipe.id)) {
				db.insert(schema.cookLog)
					.values({
						recipeId: sub.id,
						recipeSlug: sub.slug,
						cookedAt: cookedAtDate,
						cookedDate,
						source: 'meal',
						mealPlanMealId,
						benchSheetRating: null,
						createdAt: new Date()
					})
					.run();
				recomputeRecipeStats(db, sub.id);
			}
		}
	}
	return { logged: true };
}

export function unrecordCook(db: DB, mealPlanMealId: number) {
	const rows = db
		.select({ recipeId: schema.cookLog.recipeId })
		.from(schema.cookLog)
		.where(eq(schema.cookLog.mealPlanMealId, mealPlanMealId))
		.all();
	if (rows.length === 0) return { removed: 0 };
	db.delete(schema.cookLog).where(eq(schema.cookLog.mealPlanMealId, mealPlanMealId)).run();
	const recipeIds = new Set(rows.map((r) => r.recipeId).filter((id): id is number => id != null));
	for (const rid of recipeIds) recomputeRecipeStats(db, rid);
	return { removed: rows.length };
}
