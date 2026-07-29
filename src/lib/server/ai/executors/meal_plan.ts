import { z } from 'zod';
import { isoDateSchema } from '$lib/date_schema';
import { todayIso, weekStartFor } from '$lib/week';
import { createMealPlanService } from '$lib/server/workflows/meal-plan';
import { getMealSuggestionContext } from '$lib/server/workflows/meal-plan-suggestions';
import { stageMealPlanProposal } from '$lib/server/ai/meal_plan_proposal';
import { listMissedPlannedMeals } from '$lib/server/domains/meal-plan/queries';
import { getMealPlanMeal } from '$lib/server/domains/meal-plan/queries';
import { getWeekStartDay } from '$lib/server/meal_plan/prefs';
import { stageAfterCookProposal } from '$lib/server/ai/after_cook_proposal';
import type { ExecutorFn } from './shared';

const MealPlanProposalOperationSchema = z.discriminatedUnion('kind', [
	z
		.object({
			kind: z.literal('add'),
			dinner: z.string(),
			recipe_slug: z.string().nullable(),
			planned_date: isoDateSchema.nullable(),
			servings: z.number().int().positive().max(99).nullable(),
			source: z.enum(['fresh', 'freezer']),
			note: z.string().nullable(),
			reason: z.string()
		})
		.strict(),
	z
		.object({
			kind: z.literal('update'),
			meal_id: z.number().int().positive(),
			changes: z
				.object({
					week_start_date: isoDateSchema.optional(),
					dinner: z.string().optional(),
					recipe_slug: z.string().nullable().optional(),
					planned_date: isoDateSchema.nullable().optional(),
					servings: z.number().int().positive().max(99).nullable().optional(),
					source: z.enum(['fresh', 'freezer']).optional(),
					note: z.string().nullable().optional()
				})
				.strict(),
			reason: z.string()
		})
		.strict(),
	z
		.object({
			kind: z.literal('remove'),
			meal_id: z.number().int().positive(),
			reason: z.string()
		})
		.strict()
]);

export const mealPlanExecutors: Record<string, ExecutorFn> = {
	async get_meal_plan(raw, db) {
		const input = z
			.object({
				weeks: z.number().int().min(1).max(12).optional(),
				week_start_date: isoDateSchema.optional(),
				include_missed: z.boolean().optional()
			})
			.parse(raw);
		const weeks = createMealPlanService(db).weeks({
			weeks: input.weeks,
			weekStartDate: input.week_start_date
		});
		const today = todayIso();
		return {
			weeks: weeks.map((week) =>
				'weekNumber' in week
					? {
							week_start: week.weekStart,
							week_number: week.weekNumber,
							meals: week.meals
						}
					: { week_start: week.weekStart, meals: week.meals }
			),
			...(input.include_missed
				? {
						missed_meals: listMissedPlannedMeals(db, {
							today,
							currentWeekStart: weekStartFor(today, getWeekStartDay(db))
						})
					}
				: {})
		};
	},

	async plan_meal(raw, db) {
		const input = z
			.object({
				week_start_date: isoDateSchema,
				dinner: z.string(),
				recipe_slug: z.string().optional(),
				servings: z.number().int().positive().max(99).optional(),
				source: z.enum(['fresh', 'freezer']).optional(),
				note: z.string().optional()
			})
			.parse(raw);
		const result = createMealPlanService(db).create({
			weekStartDate: input.week_start_date,
			dinner: input.dinner,
			recipeSlug: input.recipe_slug,
			servings: input.servings,
			source: input.source,
			note: input.note,
			sourcePolicy: 'reject'
		});
		if (!result.ok) return { ok: false, error: result.error };
		return {
			ok: true,
			id: result.meal.id,
			week: result.meal.weekStartDate,
			dinner: result.meal.dinner,
			source: result.meal.source
		};
	},

	async remove_meal(raw, db) {
		const input = z.object({ id: z.number().int().positive() }).parse(raw);
		const result = createMealPlanService(db).remove(input.id, { unrecordCooked: false });
		return result.ok
			? { ok: true, removed: result.meal.dinner }
			: { ok: false, error: result.error };
	},

	async mark_meal_cooked(raw, db, userId) {
		const input = z
			.object({
				id: z.number().int().positive(),
				cooked_date: isoDateSchema.optional(),
				eaten_portions: z.number().int().positive().max(99).optional()
			})
			.parse(raw);
		const cookedDate = input.cooked_date ?? todayIso();
		const meal = getMealPlanMeal(db, input.id);
		if (!meal) return { ok: false, error: 'Meal not found' };
		if (meal.source === 'freezer' && meal.recipeSlug) {
			return {
				ok: true,
				kind: 'after_cook_proposal',
				...stageAfterCookProposal(db, {
					userId,
					mealId: input.id,
					cookedDate,
					eatenPortions: input.eaten_portions
				})
			};
		}
		const result = createMealPlanService(db).cook(input.id, cookedDate);
		if (!result.ok) return { ok: false, error: result.error };
		return { ok: true, meal: result.meal.dinner, cooked_date: cookedDate };
	},

	async suggest_meals(raw, db) {
		const input = z
			.object({
				week_start_date: isoDateSchema.optional(),
				count: z.number().int().min(1).max(10).optional()
			})
			.parse(raw);
		return getMealSuggestionContext(db, {
			weekStartDate: input.week_start_date,
			count: input.count
		});
	},

	async propose_meal_plan(raw, db, userId) {
		const input = z
			.object({
				week_start_date: isoDateSchema,
				title: z.string(),
				recommendation: z
					.object({
						why_now: z.string().optional(),
						evidence: z.array(z.string()).max(12).default([]),
						confidence: z.enum(['high', 'medium', 'low']).optional(),
						uncertainty: z.string().nullable().optional(),
						consequence: z.string().optional(),
						alternatives: z.array(z.string()).max(8).default([])
					})
					.strict(),
				operations: z.array(MealPlanProposalOperationSchema).min(1).max(14)
			})
			.strict()
			.parse(raw);
		const proposal = stageMealPlanProposal(db, {
			userId,
			weekStartDate: input.week_start_date,
			title: input.title,
			recommendation: {
				...(input.recommendation.why_now
					? { whyNow: input.recommendation.why_now }
					: {}),
				evidence: input.recommendation.evidence,
				...(input.recommendation.confidence
					? { confidence: input.recommendation.confidence }
					: {}),
				...(input.recommendation.uncertainty !== undefined
					? { uncertainty: input.recommendation.uncertainty }
					: {}),
				...(input.recommendation.consequence
					? { consequence: input.recommendation.consequence }
					: {}),
				alternatives: input.recommendation.alternatives
			},
			operations: input.operations.map((operation) => {
				if (operation.kind === 'add') {
					return {
						kind: operation.kind,
						dinner: operation.dinner,
						recipeSlug: operation.recipe_slug,
						plannedDate: operation.planned_date,
						servings: operation.servings,
						source: operation.source,
						note: operation.note,
						reason: operation.reason
					};
				}
				if (operation.kind === 'remove') {
					return {
						kind: operation.kind,
						mealId: operation.meal_id,
						reason: operation.reason
					};
				}
				return {
					kind: operation.kind,
					mealId: operation.meal_id,
					changes: {
						...(operation.changes.week_start_date
							? { weekStartDate: operation.changes.week_start_date }
							: {}),
						...(operation.changes.dinner !== undefined
							? { dinner: operation.changes.dinner }
							: {}),
						...(operation.changes.recipe_slug !== undefined
							? { recipeSlug: operation.changes.recipe_slug }
							: {}),
						...(operation.changes.planned_date !== undefined
							? { plannedDate: operation.changes.planned_date }
							: {}),
						...(operation.changes.servings !== undefined
							? { servings: operation.changes.servings }
							: {}),
						...(operation.changes.source !== undefined
							? { source: operation.changes.source }
							: {}),
						...(operation.changes.note !== undefined
							? { note: operation.changes.note }
							: {})
					},
					reason: operation.reason
				};
			})
		});
		return { ok: true, kind: 'meal_plan_proposal', ...proposal };
	},

	async log_meal(raw, db) {
		const input = z
			.object({
				date: isoDateSchema.optional(),
				recipe_slug: z.string().optional(),
				meal_name: z.string().optional(),
				rating: z.number().min(1).max(5).optional(),
				notes: z.string().optional()
			})
			.parse(raw);
		const entry = createMealPlanService(db).logMeal({
			date: input.date,
			recipeSlug: input.recipe_slug,
			mealName: input.meal_name,
			rating: input.rating,
			notes: input.notes
		});
		return { ok: true, id: entry.id };
	}
};
