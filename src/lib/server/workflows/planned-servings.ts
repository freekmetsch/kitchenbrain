import { z } from 'zod';
import type { DbOrTx } from '$lib/server/db/types';
import { getMealPlanMeal } from '$lib/server/domains/meal-plan/queries';
import { getWeekStartDay } from '$lib/server/meal_plan/prefs';
import { todayIso, weekStartFor } from '$lib/week';

export const plannedServingsSchema = z.number().int().positive().max(99);

export function validatePlannedServingsChange(db: DbOrTx, id: number) {
	const meal = getMealPlanMeal(db, id);
	if (!meal) {
		return { ok: false as const, code: 'not_found' as const, error: 'Meal not found' };
	}
	const currentWeekStart = weekStartFor(todayIso(), getWeekStartDay(db));
	if (meal.weekStartDate < currentWeekStart) {
		return {
			ok: false as const,
			code: 'past_week' as const,
			error: 'Past meal portions cannot be changed'
		};
	}
	if (meal.status === 'cooked') {
		return {
			ok: false as const,
			code: 'already_cooked' as const,
			error: 'Cooked meal portions cannot be changed'
		};
	}
	return { ok: true as const, meal };
}
