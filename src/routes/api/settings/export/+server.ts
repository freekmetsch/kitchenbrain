import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { inventoryItems, recipes, mealPlanMeals, mealLog, mealSubRecipes, shoppingListOverrides } from '$lib/server/db/schema';
import { isNull } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const data = {
		exported_at: new Date().toISOString(),
		inventory: db
			.select()
			.from(inventoryItems)
			.where(isNull(inventoryItems.deletedAt))
			.all(),
		recipes: db.select().from(recipes).all(),
		meal_plan: db.select().from(mealPlanMeals).all(),
		meal_log: db.select().from(mealLog).all(),
		// Meal Recipe composition (ADR 0003) — without this, bootstrap-mode import
		// can't restore which sub-recipes make up a meal recipe.
		meal_sub_recipes: db.select().from(mealSubRecipes).all(),
		shopping_overrides: db.select().from(shoppingListOverrides).all()
	};

	const filename = `household-brain-export-${new Date().toISOString().slice(0, 10)}.json`;

	return new Response(JSON.stringify(data, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
