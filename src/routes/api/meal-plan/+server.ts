import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { mealPlanMeals, recipes } from '$lib/server/db/schema';
import { getWeekStartDay } from '$lib/server/meal_plan/prefs';
import { isoWeekNumber, weekStartFor } from '$lib/week';
import { readJsonBody } from '$lib/server/api_body';
import { isoDateSchema } from '$lib/date_schema';
import { reconcileShoppingAfterWrite } from '$lib/server/shopping_entries';

const CreateSchema = z.object({
	weekStartDate: isoDateSchema,
	dinner: z.string().min(1).max(500),
	recipeSlug: z.string().nullable().optional(),
	servings: z.number().int().positive().max(99).nullable().optional(),
	plannedDate: isoDateSchema.nullable().optional(),
	source: z.enum(['fresh', 'freezer']).optional()
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

	const baselineServings = body.recipeSlug
		? db.select({ servings: recipes.servings }).from(recipes).where(eq(recipes.slug, body.recipeSlug)).get()?.servings ?? null
		: null;
	const meal = db
		.insert(mealPlanMeals)
		.values({
			weekNumber: isoWeekNumber(weekStartDate),
			weekStartDate,
			dinner: body.dinner,
			recipeSlug: body.recipeSlug ?? null,
			servings: body.servings ?? baselineServings,
			plannedDate: body.plannedDate ?? null,
			// A meal can only be served from the freezer when there's a recipe to
			// link the frozen portions through.
			source: body.source === 'freezer' && body.recipeSlug ? 'freezer' : 'fresh',
			sortOrder: nextOrder,
			createdAt: new Date()
		})
		.returning()
		.get();
	reconcileShoppingAfterWrite(db, [weekStartDate]);

	return json(meal);
};
