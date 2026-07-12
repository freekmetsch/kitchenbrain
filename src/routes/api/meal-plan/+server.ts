import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { mealPlanMeals } from '$lib/server/db/schema';
import { isoWeekNumber } from '$lib/week';
import { readJsonBody } from '$lib/server/api_body';

const CreateSchema = z.object({
	weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	dinner: z.string().min(1).max(500),
	recipeSlug: z.string().nullable().optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const { weekStartDate, dinner, recipeSlug } = await readJsonBody(request, CreateSchema);

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
			dinner,
			recipeSlug: recipeSlug ?? null,
			sortOrder: nextOrder,
			createdAt: new Date()
		})
		.returning()
		.get();

	return json(meal);
};
