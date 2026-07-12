import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { mealPlanMeals } from '$lib/server/db/schema';
import { recordCook, unrecordCook } from '$lib/server/cook_log';
import { todayIso } from '$lib/week';
import { readJsonBody } from '$lib/server/api_body';

const UpdateSchema = z.object({
	status: z.enum(['planned', 'cooked']).nullable().optional(),
	cookedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
});

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(400, 'Invalid id');
	const body = await readJsonBody(request, UpdateSchema);

	const newStatus: 'planned' | 'cooked' = body.status ?? 'cooked';
	const cookedDate = newStatus === 'planned' ? null : (body.cookedDate ?? todayIso());

	const meal = db
		.update(mealPlanMeals)
		.set({ status: newStatus, cookedDate })
		.where(eq(mealPlanMeals.id, id))
		.returning()
		.get();
	if (!meal) throw error(404, 'Meal not found');

	if (newStatus === 'cooked') {
		recordCook(db, {
			recipeSlug: meal.recipeSlug,
			cookedDate: cookedDate as string,
			source: 'plan',
			mealPlanMealId: meal.id
		});
	} else {
		unrecordCook(db, meal.id);
	}

	return json(meal);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(400, 'Invalid id');
	const meal = db.select().from(mealPlanMeals).where(eq(mealPlanMeals.id, id)).get();
	if (!meal) throw error(404, 'Meal not found');
	if (meal.status === 'cooked') unrecordCook(db, meal.id);
	db.delete(mealPlanMeals).where(eq(mealPlanMeals.id, id)).run();
	return json({ ok: true, meal });
};
