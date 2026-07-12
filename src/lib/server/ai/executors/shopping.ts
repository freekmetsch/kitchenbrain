import { z } from 'zod';
import { eq, isNull, inArray } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type { Ingredient } from '$lib/server/db/schema';
import { normalizeNameKey } from '$lib/match';
import { isoWeekStart } from '$lib/week';
import type { ExecutorFn } from './shared';

export const shoppingExecutors: Record<string, ExecutorFn> = {
	async generate_shopping_list(raw, db) {
		const input = z.object({ week_start_date: z.string().optional() }).parse(raw);
		const weekStart = input.week_start_date ?? isoWeekStart();

		const meals = db
			.select()
			.from(schema.mealPlanMeals)
			.where(eq(schema.mealPlanMeals.weekStartDate, weekStart))
			.all();

		const slugs = meals.filter((m) => m.recipeSlug).map((m) => m.recipeSlug!);
		const recipeList =
			slugs.length > 0
				? db
						.select({ slug: schema.recipes.slug, ingredients: schema.recipes.ingredients })
						.from(schema.recipes)
						.where(inArray(schema.recipes.slug, slugs))
						.all()
				: [];

		const needed = new Map<string, { amount: string; unit?: string }>();
		for (const recipe of recipeList) {
			for (const ing of recipe.ingredients as Ingredient[]) {
				needed.set(ing.name.toLowerCase(), { amount: ing.amount, unit: ing.unit });
			}
		}

		const inventory = db
			.select({ name: schema.inventoryItems.name })
			.from(schema.inventoryItems)
			.where(isNull(schema.inventoryItems.deletedAt))
			.all();

		// Exclude anything already in stock, matched on the canonical Dutch name key
		// (not fuzzy substring — avoids "rijst" masking "rijstazijn"). Pantry staples
		// live in inventory, so this drops them too.
		const stockKeys = new Set(inventory.map((inv) => normalizeNameKey(inv.name)));
		const missing = [...needed.entries()]
			.filter(([name]) => !stockKeys.has(normalizeNameKey(name)))
			.map(([name, { amount, unit }]) => ({ name, amount, unit: unit ?? null }));

		const noRecipeMeals = meals.filter((m) => !m.recipeSlug).map((m) => m.dinner);

		return {
			week: weekStart,
			shopping_list: missing,
			meals_without_recipe: noRecipeMeals,
			note: `${meals.length} meals planned. ${missing.length} ingredients needed.`
		};
	}
};
