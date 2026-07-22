import { z } from 'zod';
import { and, eq, gte, isNull, lt } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { normalizeNameKey } from '$lib/match';
import { deriveWeekNeeds } from '$lib/server/shopping_needs';
import { getWeekStartDay } from '$lib/server/meal_plan/prefs';
import { todayIso, weekKeyRange, weekStartFor } from '$lib/week';
import { isoDateSchema } from '$lib/date_schema';
import type { ExecutorFn } from './shared';

export const shoppingExecutors: Record<string, ExecutorFn> = {
	async generate_shopping_list(raw, db) {
		const input = z.object({ week_start_date: isoDateSchema.optional() }).parse(raw);
		// Household planning-week boundary + range query, mirroring the shopping
		// page load: meals keyed under an older week-start convention still count.
		const weekStart = weekStartFor(input.week_start_date ?? todayIso(), getWeekStartDay(db));
		const keyRange = weekKeyRange(weekStart);

		const meals = db
			.select()
			.from(schema.mealPlanMeals)
			.where(
				and(
					gte(schema.mealPlanMeals.weekStartDate, keyRange.from),
					lt(schema.mealPlanMeals.weekStartDate, keyRange.to)
				)
			)
			.all();

		// Shared freezer-aware derivation (same seam as the shopping page): fresh
		// meals need everything, freezer-served meals only their serve_fresh
		// sides, and role-less freezer recipes are reported instead of guessed.
		const needs = deriveWeekNeeds(db, meals);

		const inventory = db
			.select({ name: schema.inventoryItems.name, isStaple: schema.inventoryItems.isStaple })
			.from(schema.inventoryItems)
			.where(isNull(schema.inventoryItems.deletedAt))
			.all();

		// Exclude anything already in stock, matched on the canonical Dutch name key
		// (not fuzzy substring — avoids "rijst" masking "rijstazijn"). Pantry staples
		// live in inventory, so this drops them too.
		const stockKeys = new Set(inventory.map((inv) => normalizeNameKey(inv.name)));
		const stapleKeys = new Set(inventory.filter((inv) => inv.isStaple).map((inv) => normalizeNameKey(inv.name)));
		const overrides = db.select().from(schema.shoppingListOverrides)
			.where(eq(schema.shoppingListOverrides.weekStartDate, weekStart)).all();
		const overrideByName = new Map(overrides.map((row) => [normalizeNameKey(row.name), row]));
		const missing = needs.needed
			.map((need) => {
				const key = normalizeNameKey(need.name);
				const override = overrideByName.get(key);
				const included = override?.included ?? (!need.optional && !stapleKeys.has(key));
				const name = override?.selectedName ?? need.name;
				const forceMissing = stapleKeys.has(key) && override?.included === true;
				return { need, included, name, forceMissing };
			})
			.filter(({ included, name, forceMissing }) => included && (forceMissing || !stockKeys.has(normalizeNameKey(name))))
			.map(({ need, name }) => ({
				source_name: need.name,
				name,
				amount: need.amount,
				unit: need.unit ?? null,
				for_meals: need.forMeals,
				fresh_side_for_freezer_meal: need.freshSideOnly,
				incompatible_quantities: need.incompatibleQuantities
			}));

		const freezerNote = needs.freezerMealsMissingFreshInfo.length
			? ` ${needs.freezerMealsMissingFreshInfo.length} freezer meal(s) lack cook_in/serve_fresh ingredient roles, so their fresh sides are unknown — offer to set roles on those recipes.`
			: '';

		return {
			week: weekStart,
			shopping_list: missing,
			meals_without_recipe: needs.mealsWithoutRecipe,
			freezer_meals: needs.freezerMeals,
			freezer_meals_missing_fresh_info: needs.freezerMealsMissingFreshInfo,
			note: `${meals.length} meals planned. ${missing.length} ingredients needed.${freezerNote}`
		};
	}
};
