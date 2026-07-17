import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { mealPlanMeals } from '$lib/server/db/schema';
import { getWeekStartDay } from '$lib/server/meal_plan/prefs';
import { isoWeekNumber, weekStartFor } from '$lib/week';
import { readJsonBody } from '$lib/server/api_body';

const CreateSchema = z.object({
	weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	dinner: z.string().min(1).max(500),
	recipeSlug: z.string().nullable().optional(),
	plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await readJsonBody(request, CreateSchema);
	// Snap any date inside the week to the household's planning-week start, so
	// every client (page, recipe sheet, chat executor) lands in the same bucket
	// regardless of the configured week-start day.
	const weekStartDate = weekStartFor(body.weekStartDate, getWeekStartDay());

	const existing = db
		.select({ sortOrder: mealPlanMeals.sortOrder })
		.from(mealPlanMeals)
		.where(eq(mealPlanMeals.weekStartDate, weekStartDate))
		.orderBy(desc(mealPlanMeals.sortOrder))
		.get();
	const nextOrder = (existing?.sortOrder ?? -1) + 1;

	const meal = db
		.insert(mealPlanMeals)
		.values({
			weekNumber: isoWeekNumber(weekStartDate),
			weekStartDate,
			dinner: body.dinner,
			recipeSlug: body.recipeSlug ?? null,
			plannedDate: body.plannedDate ?? null,
			sortOrder: nextOrder,
			createdAt: new Date()
		})
		.returning()
		.get();

	return json(meal);
};
