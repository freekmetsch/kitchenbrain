import { z } from 'zod';
import { isoDateSchema } from '$lib/date_schema';
import { todayIso } from '$lib/week';
import { createMealPlanService } from '$lib/server/workflows/meal-plan';
import { getMealSuggestionContext } from '$lib/server/workflows/meal-plan-suggestions';
import type { ExecutorFn } from './shared';

export const mealPlanExecutors: Record<string, ExecutorFn> = {
	async get_meal_plan(raw, db) {
		const input = z
			.object({
				weeks: z.number().int().min(1).max(12).optional(),
				week_start_date: isoDateSchema.optional()
			})
			.parse(raw);
		const weeks = createMealPlanService(db).weeks({
			weeks: input.weeks,
			weekStartDate: input.week_start_date
		});
		return {
			weeks: weeks.map((week) =>
				'weekNumber' in week
					? {
							week_start: week.weekStart,
							week_number: week.weekNumber,
							meals: week.meals
						}
					: { week_start: week.weekStart, meals: week.meals }
			)
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

	async mark_meal_cooked(raw, db) {
		const input = z
			.object({ id: z.number().int().positive(), cooked_date: isoDateSchema.optional() })
			.parse(raw);
		const cookedDate = input.cooked_date ?? todayIso();
		const result = createMealPlanService(db).cook(input.id, cookedDate);
		if (!result.ok) return { ok: false, error: result.error };
		if (result.meal.source === 'freezer' && result.meal.recipeSlug) {
			return {
				ok: true,
				meal: result.meal.dinner,
				cooked_date: cookedDate,
				note: `This meal was served from the freezer. Ask how many portions were eaten and deduct them from the leftover linked to recipe '${result.meal.recipeSlug}' (update_inventory_item, or remove_from_inventory when none are left).`
			};
		}
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
