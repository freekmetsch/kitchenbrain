import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { and, desc, eq, gte, isNull, inArray, lt } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import * as schema from '$lib/server/db/schema';
import { namesMatch, normalizeNameKey } from '$lib/match';
import { expandMealIngredients } from '$lib/server/meal_recipes';
import { getAHStatus } from '$lib/server/ah/client';
import { getMealPlanPrefs } from '$lib/server/meal_plan/prefs';
import { addDays, dateOfWeekday, todayIso, weekKeyRange, weekStartFor } from '$lib/week';

export type ShoppingItem = {
	name: string;
	amount: string | null;
	unit: string | null;
	bought: boolean;
	manual: boolean;
	covered?: boolean;
	staple?: boolean;
};

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, '/login');

	const prefs = getMealPlanPrefs();
	const weekParam = url.searchParams.get('week');
	const weekStart = weekStartFor(weekParam ?? todayIso(), prefs.weekStartDay);

	// Range query, not equality: meals created before a week-start-day change
	// keep their old week key. weekKeyRange matches every key whose week
	// overlaps this planning week the most (same rule as the meal plan page).
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

	const slugs = meals.filter((m) => m.recipeSlug).map((m) => m.recipeSlug!);
	const recipeList =
		slugs.length > 0
			? db
					.select({ id: schema.recipes.id, slug: schema.recipes.slug, ingredients: schema.recipes.ingredients })
					.from(schema.recipes)
					.where(inArray(schema.recipes.slug, slugs))
					.all()
			: [];

	const needed = new Map<string, { name: string; amount: string; unit?: string }>();
	for (const recipe of recipeList) {
		// A planned Meal Recipe expands to its sub-recipes' ingredients plus its
		// own (ADR 0003) BEFORE the existing week-level dedup below.
		// AH-INVARIANT: shopping derivation uses canonical Dutch recipe ingredient names.
		for (const ing of expandMealIngredients(db, recipe)) {
			if (!needed.has(ing.name.toLowerCase()))
				needed.set(ing.name.toLowerCase(), { name: ing.name, amount: ing.amount, unit: ing.unit });
		}
	}

	const inventory = db
		.select({ name: schema.inventoryItems.name, isStaple: schema.inventoryItems.isStaple })
		.from(schema.inventoryItems)
		.where(isNull(schema.inventoryItems.deletedAt))
		.all();

	// P4.4: pantry staples are always kept on hand, so drop them from the derived
	// list by default. A "we're out" override (manual row for that week) re-adds
	// the staple as a to-buy item — see the override merge below.
	// Match staples on the canonical name key (not fuzzy namesMatch) so a staple
	// like "rijst" doesn't also hide "rijstazijn" from the list.
	const stapleKeys = new Set(inventory.filter((inv) => inv.isStaple).map((s) => normalizeNameKey(s.name)));
	const isStapleName = (name: string) => stapleKeys.has(normalizeNameKey(name));

	const derived: ShoppingItem[] = [...needed.values()].map(({ name, amount, unit }) => ({
		name,
		amount: amount ?? null,
		unit: unit ?? null,
		bought: false,
		manual: false,
		covered: inventory.some((inv) => namesMatch(name, inv.name)),
		staple: isStapleName(name)
	}));

	const overrides = db
		.select()
		.from(schema.shoppingListOverrides)
		.where(eq(schema.shoppingListOverrides.weekStartDate, weekStart))
		.all();

	const pushRows = db
		.select()
		.from(schema.shoppingPushHistory)
		.where(eq(schema.shoppingPushHistory.weekStartDate, weekStart))
		.orderBy(desc(schema.shoppingPushHistory.createdAt))
		.limit(5)
		.all();

	const pushIds = pushRows.map((row) => row.id);
	const pushItems =
		pushIds.length > 0
			? db
					.select()
					.from(schema.shoppingPushItems)
					.where(inArray(schema.shoppingPushItems.pushId, pushIds))
					.all()
			: [];
	const pushItemsById = new Map<number, typeof pushItems>();
	for (const item of pushItems) {
		if (!pushItemsById.has(item.pushId)) pushItemsById.set(item.pushId, []);
		pushItemsById.get(item.pushId)!.push(item);
	}

	const overrideMap = new Map(overrides.map((o) => [o.name.toLowerCase(), o]));
	const derivedNames = new Set(derived.map((i) => i.name.toLowerCase()));

	const items: ShoppingItem[] = [];
	for (const item of derived) {
		const ov = overrideMap.get(item.name.toLowerCase());
		if (item.staple && !ov) continue; // excluded by default; only shown when out
		// A staple with an override is a "we're out" signal — force it visible and
		// not-covered even though the staple item still physically exists in stock.
		items.push(item.staple ? { ...item, covered: false, bought: ov!.bought } : ov ? { ...item, bought: ov.bought } : item);
	}

	for (const ov of overrides) {
		if (ov.manual && !derivedNames.has(ov.name.toLowerCase())) {
			items.push({
				name: ov.name,
				amount: ov.amount ?? null,
				unit: ov.unit ?? null,
				bought: ov.bought,
				manual: true,
				covered: false
			});
		}
	}

	return {
		weekStart,
		prevWeek: addDays(weekStart, -7),
		nextWeek: addDays(weekStart, 7),
		isCurrentWeek: weekStart === weekStartFor(todayIso(), prefs.weekStartDay),
		deliveryDate:
			prefs.groceryDay == null ? null : dateOfWeekday(weekStart, prefs.groceryDay, prefs.weekStartDay),
		emptyState: meals.length === 0 ? 'no_meals' : 'nothing_needed',
		// Connection status drives the "not connected" banner — the AH push in the
		// sheet fails closed anyway, but surfacing it up front spares the user the
		// dead-end round-trip into the modal.
		ah: getAHStatus(),
		items,
		mealsWithoutRecipe: meals.filter((m) => !m.recipeSlug).map((m) => m.dinner),
		pushHistory: pushRows.map((row) => ({
			...row,
			items: pushItemsById.get(row.id) ?? []
		}))
	};
};
