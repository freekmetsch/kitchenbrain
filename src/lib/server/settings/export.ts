import { isNull } from 'drizzle-orm';
import {
	inventoryItems,
	recipes,
	mealPlanMeals,
	mealLog,
	mealSubRecipes,
	shoppingListOverrides,
	recurringShoppingItems,
	shoppingWeekEntries,
	ahFavorites,
	recipeAhPreferences
} from '$lib/server/db/schema';
import type { Db } from '$lib/server/db/types';

export function buildHouseholdExport(database: Db, now = new Date()) {
	return {
		exported_at: now.toISOString(),
		inventory: database
			.select()
			.from(inventoryItems)
			.where(isNull(inventoryItems.deletedAt))
			.all(),
		recipes: database.select().from(recipes).all(),
		meal_plan: database.select().from(mealPlanMeals).all(),
		meal_log: database.select().from(mealLog).all(),
		// Meal Recipe composition (ADR 0003) — without this, bootstrap-mode import
		// can't restore which sub-recipes make up a meal recipe.
		meal_sub_recipes: database.select().from(mealSubRecipes).all(),
		shopping_overrides: database.select().from(shoppingListOverrides).all(),
		recurring_shopping_items: database.select().from(recurringShoppingItems).all(),
		shopping_week_entries: database.select().from(shoppingWeekEntries).all(),
		ah_favorites: database.select().from(ahFavorites).all(),
		recipe_ah_preferences: database.select().from(recipeAhPreferences).all()
	};
}
