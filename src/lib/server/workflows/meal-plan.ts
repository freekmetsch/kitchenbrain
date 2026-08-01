import { db as appDb } from '$lib/server/db/index';
import type { Db, DbOrTx } from '$lib/server/db/types';
import {
	createMealPlanMeal,
	deleteCookLogsForMeal,
	deleteMealPlanMeal,
	insertCookLog,
	insertMealLog,
	setMealPlanStatus,
	updateMealPlanMetadata,
	type UpdateMealPlanMetadataInput
} from '$lib/server/domains/meal-plan/commands';
import {
	cookLogRecipeIdsForMeal,
	cookStatsForRecipe,
	findCookLogForMeal,
	findManualCookForDate,
	getMealPlanMeal,
	listMealsForWeek
} from '$lib/server/domains/meal-plan/queries';
import {
	getRecipeBySlug,
	getActiveRecipeBySlug,
	subRecipesOf,
	updateRecipeCookStats
} from '$lib/server/domains/recipes';
import { getWeekStartDay } from '$lib/server/meal_plan/prefs';
import { reconcileShoppingAfterWrite } from '$lib/server/workflows/reconcile-shopping';
import { validatePlannedServingsChange } from '$lib/server/workflows/planned-servings';
import type { BenchSheetRating } from '$lib/types';
import { addDays, isoWeekNumber, todayIso, weekStartFor } from '$lib/week';
import { rotationShortlistForWeek } from '$lib/server/workflows/meal-rotation';

type CreateInput = {
	weekStartDate: string;
	dinner: string;
	recipeSlug?: string | null;
	servings?: number | null;
	plannedDate?: string | null;
	source?: 'fresh' | 'freezer';
	note?: string | null;
	sourcePolicy: 'coerce-fresh' | 'reject';
};

type DeleteOptions = {
	/** HTTP preserves its historical cook-log cleanup; AI historically does not. */
	unrecordCooked: boolean;
};

function recomputeRecipeStats(db: DbOrTx, recipeId: number): void {
	updateRecipeCookStats(db, recipeId, cookStatsForRecipe(db, recipeId));
}

function recordCookInTransaction(
	db: DbOrTx,
	input: {
		recipeSlug: string | null;
		cookedDate: string;
		source: 'plan' | 'manual' | 'backfill';
		mealPlanMealId?: number | null;
		benchSheetRating?: BenchSheetRating | null;
	}
) {
	if (input.mealPlanMealId != null && findCookLogForMeal(db, input.mealPlanMealId)) {
		return { logged: false as const, reason: 'already_logged' as const };
	}
	const recipe = input.recipeSlug ? getRecipeBySlug(db, input.recipeSlug) : undefined;
	insertCookLog(db, {
		recipeId: recipe?.id ?? null,
		recipeSlug: input.recipeSlug,
		cookedDate: input.cookedDate,
		source: input.source,
		mealPlanMealId: input.mealPlanMealId,
		benchSheetRating: input.benchSheetRating
	});
	if (recipe) {
		recomputeRecipeStats(db, recipe.id);
		for (const subRecipe of subRecipesOf(db, recipe.id)) {
			insertCookLog(db, {
				recipeId: subRecipe.id,
				recipeSlug: subRecipe.slug,
				cookedDate: input.cookedDate,
				source: 'meal',
				mealPlanMealId: input.mealPlanMealId
			});
			recomputeRecipeStats(db, subRecipe.id);
		}
	}
	return { logged: true as const };
}

function unrecordCookInTransaction(db: DbOrTx, mealPlanMealId: number) {
	const recipeIds = cookLogRecipeIdsForMeal(db, mealPlanMealId);
	if (recipeIds.length === 0) return { removed: 0 };
	const removed = deleteCookLogsForMeal(db, mealPlanMealId);
	for (const recipeId of new Set(recipeIds.filter((id): id is number => id != null))) {
		recomputeRecipeStats(db, recipeId);
	}
	return { removed };
}

type MealPlanDependencies = {
	reconcileShopping: typeof reconcileShoppingAfterWrite;
};

const DEFAULT_DEPENDENCIES: MealPlanDependencies = {
	reconcileShopping: reconcileShoppingAfterWrite
};

export function createMealPlanService(
	db: Db,
	dependencies: MealPlanDependencies = DEFAULT_DEPENDENCIES
) {
	return {
		createFromRotation(input: {
			weekStartDate: string;
			recipeSlug: string;
			candidateKey: string;
		}) {
			return db.transaction((tx) => {
				const weekStartDay = getWeekStartDay(tx);
				const weekStartDate = weekStartFor(input.weekStartDate, weekStartDay);
				const currentWeekStart = weekStartFor(todayIso(), weekStartDay);
				const shortlist = rotationShortlistForWeek(tx, weekStartDate, currentWeekStart);
				const candidate = [...shortlist.due, ...shortlist.freezerLow].find(
					(row) => row.slug === input.recipeSlug && row.key === input.candidateKey
				);
				if (!candidate) {
					return {
						ok: false as const,
						code: 'rotation_drift' as const,
						candidates: shortlist
					};
				}
				const meal = createMealPlanMeal(tx, {
					weekNumber: isoWeekNumber(weekStartDate),
					weekStartDate,
					dinner: candidate.titleEn ?? candidate.title,
					recipeSlug: candidate.slug,
					servings: candidate.servings,
					plannedDate: null,
					source: candidate.source,
					note: null
				});
				dependencies.reconcileShopping(tx, [weekStartDate]);
				return { ok: true as const, meal };
			});
		},

		create(input: CreateInput) {
			return db.transaction((tx) => {
				if (input.source === 'freezer' && !input.recipeSlug && input.sourcePolicy === 'reject') {
					return {
						ok: false as const,
						code: 'source_requires_recipe' as const,
						error:
							'source=freezer requires recipe_slug (frozen portions are linked through the recipe)'
					};
				}
				const weekStartDate = weekStartFor(
					input.weekStartDate,
					getWeekStartDay(tx)
				);
				const recipe = input.recipeSlug ? getActiveRecipeBySlug(tx, input.recipeSlug) : undefined;
				if (input.recipeSlug && !recipe) {
					return {
						ok: false as const,
						code: 'recipe_unavailable' as const,
						error: 'Recipe is unavailable for new meal plans'
					};
				}
				const meal = createMealPlanMeal(tx, {
					weekNumber: isoWeekNumber(weekStartDate),
					weekStartDate,
					dinner: input.dinner,
					recipeSlug: input.recipeSlug ?? null,
					servings: input.servings ?? recipe?.servings ?? null,
					plannedDate: input.plannedDate ?? null,
					source:
						input.source === 'freezer' && input.recipeSlug ? 'freezer' : 'fresh',
					note: input.note ?? null
				});
				dependencies.reconcileShopping(tx, [weekStartDate]);
				return { ok: true as const, meal };
			});
		},

		updateMetadata(id: number, input: UpdateMealPlanMetadataInput) {
			return db.transaction((tx) => {
				const result = updateMealPlanMetadata(tx, id, input);
				if (result.ok) {
					dependencies.reconcileShopping(tx, [result.meal.weekStartDate]);
				}
				return result;
			});
		},

		setPlannedServings(
			id: number,
			servings: number,
			source?: 'fresh' | 'freezer'
		) {
			return db.transaction((tx) => {
				const editable = validatePlannedServingsChange(tx, id);
				if (!editable.ok) return editable;
				const result = updateMealPlanMetadata(tx, id, {
					servings,
					...(source === undefined ? {} : { source })
				});
				if (result.ok) dependencies.reconcileShopping(tx, [result.meal.weekStartDate]);
				return result;
			});
		},

		cook(id: number, cookedDate = todayIso()) {
			return db.transaction((tx) => {
				const result = setMealPlanStatus(tx, id, 'cooked', cookedDate);
				if (!result.ok) return result;
				const cook = recordCookInTransaction(tx, {
					recipeSlug: result.meal.recipeSlug,
					cookedDate,
					source: 'plan',
					mealPlanMealId: result.meal.id
				});
				return { ...result, cook };
			});
		},

		uncook(id: number) {
			return db.transaction((tx) => {
				const result = setMealPlanStatus(tx, id, 'planned', null);
				if (!result.ok) return result;
				return { ...result, cook: unrecordCookInTransaction(tx, id) };
			});
		},

		remove(id: number, options: DeleteOptions) {
			return db.transaction((tx) => {
				const meal = getMealPlanMeal(tx, id);
				if (!meal) {
					return { ok: false as const, code: 'not_found' as const, error: 'Meal not found' };
				}
				if (options.unrecordCooked && meal.status === 'cooked') {
					unrecordCookInTransaction(tx, meal.id);
				}
				deleteMealPlanMeal(tx, meal.id);
				dependencies.reconcileShopping(tx, [meal.weekStartDate]);
				return { ok: true as const, meal };
			});
		},

		weeks(input: { weeks?: number; weekStartDate?: string }) {
			const weekStartDay = getWeekStartDay(db);
			if (input.weekStartDate) {
				const weekStart = weekStartFor(input.weekStartDate, weekStartDay);
				return [{ weekStart, meals: listMealsForWeek(db, weekStart) }];
			}
			const currentWeekStart = weekStartFor(todayIso(), weekStartDay);
			return Array.from({ length: input.weeks ?? 2 }, (_, index) => {
				const weekStart = addDays(currentWeekStart, index * 7);
				return {
					weekStart,
					weekNumber: isoWeekNumber(weekStart),
					meals: listMealsForWeek(db, weekStart)
				};
			});
		},

		logMeal(input: {
			date?: string;
			recipeSlug?: string;
			mealName?: string;
			rating?: number;
			notes?: string;
		}) {
			return db.transaction((tx) =>
				insertMealLog(tx, {
					date: input.date ?? todayIso(),
					recipeSlug: input.recipeSlug ?? null,
					notes: input.mealName
						? `${input.mealName}${input.notes ? ': ' + input.notes : ''}`
						: (input.notes ?? null),
					rating: input.rating ?? null
				})
			);
		},

		recordManualRecipeCook(slug: string, benchSheetRating: BenchSheetRating | null) {
			return db.transaction((tx) => {
				const recipe = getRecipeBySlug(tx, slug);
				if (!recipe) return { status: 'not_found' as const };
				const cookedDate = todayIso();
				if (findManualCookForDate(tx, slug, cookedDate)) {
					return {
						status: 'ok' as const,
						result: { logged: false as const, reason: 'already_logged_today' as const }
					};
				}
				return {
					status: 'ok' as const,
					result: recordCookInTransaction(tx, {
						recipeSlug: slug,
						cookedDate,
						source: 'manual',
						benchSheetRating
					})
				};
			});
		}
	};
}

export const mealPlanService = createMealPlanService(appDb);
