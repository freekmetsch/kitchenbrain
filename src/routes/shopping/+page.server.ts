import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { and, desc, eq, gte, isNull, inArray, lt } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import * as schema from '$lib/server/db/schema';
import { namesMatch, normalizeNameKey } from '$lib/match';
import { deriveWeekNeeds } from '$lib/server/shopping_needs';
import { getAHStatus } from '$lib/server/ah/client';
import { getMealPlanPrefs } from '$lib/server/meal_plan/prefs';
import { addDays, deliveryDateForPlanningWeek, isIsoDate, todayIso, weekKeyRange, weekStartFor } from '$lib/week';
import { sumCompatibleQuantities } from '$lib/recipe_scale';
import type { ShoppingListItem as ShoppingItem } from '$lib/components/shopping/types';
import { listShoppingOverrides } from '$lib/server/shopping_overrides';
import {
	initializeShoppingSourceData,
	isShoppingSourceMigrationComplete,
	materializeShoppingWeek
} from '$lib/server/shopping_entries';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, '/login');

	initializeShoppingSourceData(db);
	const prefs = getMealPlanPrefs();
	const weekParam = url.searchParams.get('week');
	const weekStart = weekStartFor(isIsoDate(weekParam) ? weekParam : todayIso(), prefs.weekStartDay);
	materializeShoppingWeek(db, weekStart, { weekStartDay: prefs.weekStartDay });

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

	// Freezer-aware derivation (shared with the chat executor): fresh meals need
	// their full expanded ingredient list, freezer-served meals only their
	// serve_fresh sides; role-less freezer recipes get surfaced instead of
	// guessed at. AH-INVARIANT: names are canonical Dutch recipe ingredients.
	const needs = deriveWeekNeeds(db, meals);

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

	const derived: ShoppingItem[] = needs.needed.map(({ name, amount, unit, forMeals, freshSideOnly, optional, suggested, substitutes, purchaseForm, incompatibleQuantities }) => ({
		name,
		amount: amount ?? null,
		unit: unit ?? null,
		bought: false,
		manual: false,
		included: !optional && !isStapleName(name),
		selectedName: name,
		optional,
		suggested,
		substitutes,
		purchaseForm,
		incompatibleQuantities,
		covered: inventory.some((inv) => namesMatch(name, inv.name)),
		staple: isStapleName(name),
		forMeals,
		freshSide: freshSideOnly
	}));

	const overrides = listShoppingOverrides(db, weekStart);

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

	const overrideMap = new Map(overrides.map((o) => [normalizeNameKey(o.name), o]));
	const derivedNames = new Set(derived.map((i) => normalizeNameKey(i.name)));

	const items: ShoppingItem[] = [];
	for (const item of derived) {
		const ov = overrideMap.get(normalizeNameKey(item.name));
		const included = ov?.included ?? item.included;
		const selectedName = ov?.selectedName ?? item.name;
		const manualSum = ov?.manual && ov.amount
			? sumCompatibleQuantities([
					{ amount: item.amount ?? '', unit: item.unit ?? undefined },
					{ amount: ov.amount, unit: ov.unit ?? undefined }
				])
			: null;
		items.push({
			...item,
			manualContribution: ov?.manual ?? false,
			manualAmount: ov?.manual ? ov.amount : null,
			manualUnit: ov?.manual ? ov.unit : null,
			derivedAmount: item.amount,
			derivedUnit: item.unit,
			amount: manualSum?.amount ?? (ov?.manual && ov.amount ? `${item.amount ?? ''} + ${ov.amount}` : item.amount),
			unit: manualSum?.unit ?? (ov?.manual && ov.amount ? null : item.unit),
			included,
			selectedName,
			bought: ov?.bought ?? false,
			// An included staple means "we're out" even if the staple record still exists.
			covered: item.staple && included ? false : inventory.some((inv) => namesMatch(selectedName, inv.name))
		});
	}

	for (const ov of overrides) {
		if (ov.manual && !derivedNames.has(normalizeNameKey(ov.name))) {
			items.push({
				name: ov.name,
				amount: ov.amount ?? null,
				unit: ov.unit ?? null,
				bought: ov.bought,
				manual: true,
				manualContribution: true,
				manualAmount: ov.amount ?? null,
				manualUnit: ov.unit ?? null,
				included: ov.included,
				selectedName: ov.selectedName ?? ov.name,
				covered: false
			});
		}
	}

	return {
		legacyShoppingReadOnly: isShoppingSourceMigrationComplete(db),
		weekStart,
		prevWeek: addDays(weekStart, -7),
		nextWeek: addDays(weekStart, 7),
		isCurrentWeek: weekStart === weekStartFor(todayIso(), prefs.weekStartDay),
		deliveryDate:
			prefs.groceryDay == null
				? null
				: deliveryDateForPlanningWeek(weekStart, prefs.groceryDay, prefs.weekStartDay),
		emptyState: meals.length === 0 ? 'no_meals' : 'nothing_needed',
		// Connection status drives the "not connected" banner — the AH push in the
		// sheet fails closed anyway, but surfacing it up front spares the user the
		// dead-end round-trip into the modal.
		ah: getAHStatus(),
		items,
		mealsWithoutRecipe: needs.mealsWithoutRecipe,
		freezerMeals: needs.freezerMeals,
		freezerMealsMissingFreshInfo: needs.freezerMealsMissingFreshInfo,
		pushHistory: pushRows.map((row) => ({
			...row,
			items: pushItemsById.get(row.id) ?? []
		}))
	};
};
