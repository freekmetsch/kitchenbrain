import { and, asc, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { db as appDb } from '$lib/server/db/index';
import * as schema from '$lib/server/db/schema';
import type { Db, DbOrTx } from '$lib/server/db/types';
import {
	addManualShoppingEntry,
	addRecurringShoppingItem,
	deleteAhFavorite,
	disableRecurringShoppingItem,
	editRecurringShoppingItem,
	initializeShoppingSourceData as initializeShoppingEntries,
	materializeShoppingWeek as materializeShoppingEntries,
	dryRunLegacyOverrideImport as dryRunLegacyEntries,
	importLegacyShoppingOverrides as importLegacyEntries,
	materializePlanningHorizon as materializePlanningEntries,
	removeManualShoppingEntry,
	reconcileShoppingAfterWrite as reconcileEntries,
	resolveLegacyShoppingEntry,
	setBoughtForEntries,
	skipShoppingEntry,
	updateShoppingEntry,
	upsertAhFavorite,
	getShoppingWeekView
} from '$lib/server/domains/shopping';
import { getMealPlanPrefs, getWeekStartDay } from '$lib/server/meal_plan/prefs';
import {
	addDays,
	deliveryDateForPlanningWeek,
	isIsoDate,
	todayIso,
	weekKeyRange,
	weekStartFor
} from '$lib/week';
import { deriveWeekNeeds } from './shopping-needs';
import { normalize as normalizeAhDutchTerm } from '$lib/server/ah/matching';
import { getAHStatus } from '$lib/server/ah/client';

export { deriveWeekNeeds } from './shopping-needs';
export type {
	FreezerMealRef,
	NeededIngredient,
	PlannedMealForNeeds,
	ShoppingSourceContribution,
	ShoppingSourceRef,
	WeekNeeds
} from './shopping-needs';

function shoppingSourcesForWeek(db: DbOrTx, weekStart: string) {
	const range = weekKeyRange(weekStart);
	const meals = db
		.select()
		.from(schema.mealPlanMeals)
		.where(
			and(
				gte(schema.mealPlanMeals.weekStartDate, range.from),
				lt(schema.mealPlanMeals.weekStartDate, range.to)
			)
		)
		.orderBy(asc(schema.mealPlanMeals.sortOrder), asc(schema.mealPlanMeals.id))
		.all();
	return deriveWeekNeeds(db, meals).needed.flatMap((item) => item.sources);
}

export function materializeShoppingWeek(
	db: DbOrTx,
	weekStart: string,
	options: { weekStartDay: number; today?: string; allowPastForMigration?: boolean }
) {
	return materializeShoppingEntries(db, weekStart, options, shoppingSourcesForWeek);
}

export function dryRunLegacyOverrideImport(db: DbOrTx) {
	return dryRunLegacyEntries(db, shoppingSourcesForWeek);
}

export function importLegacyShoppingOverrides(db: DbOrTx) {
	return importLegacyEntries(db, shoppingSourcesForWeek);
}

export function materializePlanningHorizon(
	db: DbOrTx,
	options: { currentWeek: string; weekStartDay: number; planAheadWeeks: number }
) {
	return materializePlanningEntries(db, options, shoppingSourcesForWeek);
}

export function initializeShoppingSourceData(db: DbOrTx) {
	return initializeShoppingEntries(db, shoppingSourcesForWeek);
}

export function reconcileShoppingAfterWrite(
	db: DbOrTx,
	affectedWeeks: string[] = [],
	_options: { today?: string } = {}
): void {
	reconcileEntries(db, affectedWeeks, shoppingSourcesForWeek);
}

export function prepareShoppingWeek(
	db: Db,
	input: { weekStart: string; weekStartDay: number }
) {
	return db.transaction((tx) => {
		initializeShoppingSourceData(tx);
		const materialized = materializeShoppingWeek(tx, input.weekStart, {
			weekStartDay: input.weekStartDay
		});
		return {
			materialized,
			view: getShoppingWeekView(tx, input.weekStart)
		};
	});
}

export function createShoppingService(db: Db) {
	const inTransaction = <T>(operation: (tx: DbOrTx) => T): T =>
		db.transaction((tx) => operation(tx));
	return {
		addRecurring(
			input: Parameters<typeof addRecurringShoppingItem>[1]
		) {
			return inTransaction((tx) => {
				initializeShoppingSourceData(tx);
				const item = addRecurringShoppingItem(tx, input);
				reconcileShoppingAfterWrite(tx, [input.startWeek]);
				return item;
			});
		},
		editRecurring(input: Parameters<typeof editRecurringShoppingItem>[1]) {
			return inTransaction((tx) => {
				initializeShoppingSourceData(tx);
				const item = editRecurringShoppingItem(tx, input);
				reconcileShoppingAfterWrite(tx, [input.effectiveWeek]);
				return item;
			});
		},
		disableRecurring(input: Parameters<typeof disableRecurringShoppingItem>[1]) {
			return inTransaction((tx) => {
				initializeShoppingSourceData(tx);
				disableRecurringShoppingItem(tx, input);
				reconcileShoppingAfterWrite(tx, [input.effectiveWeek]);
			});
		},
		skip(input: Parameters<typeof skipShoppingEntry>[1]) {
			return inTransaction((tx) => {
				initializeShoppingSourceData(tx);
				return skipShoppingEntry(tx, input);
			});
		},
		addManual(input: Parameters<typeof addManualShoppingEntry>[1]) {
			return inTransaction((tx) => {
				initializeShoppingSourceData(tx);
				return addManualShoppingEntry(tx, input);
			});
		},
		removeManual(input: Parameters<typeof removeManualShoppingEntry>[1]) {
			return inTransaction((tx) => {
				initializeShoppingSourceData(tx);
				removeManualShoppingEntry(tx, input);
			});
		},
		updateSource(input: Parameters<typeof updateShoppingEntry>[1]) {
			return inTransaction((tx) => {
				initializeShoppingSourceData(tx);
				const before = tx
					.select()
					.from(schema.shoppingWeekEntries)
					.where(eq(schema.shoppingWeekEntries.id, input.entryId))
					.get();
				if (before?.sourceKind === 'recipe' || before?.sourceKind === 'weekly') {
					materializeShoppingWeek(tx, before.weekStartDate, {
						weekStartDay: input.weekStartDay
					});
				}
				return updateShoppingEntry(tx, input);
			});
		},
		setBought(input: Parameters<typeof setBoughtForEntries>[1]) {
			return inTransaction((tx) => {
				initializeShoppingSourceData(tx);
				setBoughtForEntries(tx, input);
			});
		},
		resolveLegacy(input: Parameters<typeof resolveLegacyShoppingEntry>[1]) {
			return inTransaction((tx) => {
				initializeShoppingSourceData(tx);
				return resolveLegacyShoppingEntry(tx, input);
			});
		}
	};
}

export function loadShoppingPageData(db: Db, weekParam: string | null) {
	const prefs = getMealPlanPrefs(db);
	const weekStart = weekStartFor(isIsoDate(weekParam) ? weekParam : todayIso(), prefs.weekStartDay);
	return db.transaction((tx) => {
		initializeShoppingSourceData(tx);
		materializeShoppingWeek(tx, weekStart, { weekStartDay: prefs.weekStartDay });
		const keyRange = weekKeyRange(weekStart);
		const meals = tx
			.select()
			.from(schema.mealPlanMeals)
			.where(
				and(
					gte(schema.mealPlanMeals.weekStartDate, keyRange.from),
					lt(schema.mealPlanMeals.weekStartDate, keyRange.to)
				)
			)
			.all();
		const needs = deriveWeekNeeds(tx, meals);
		const shopping = getShoppingWeekView(tx, weekStart);
		const pushRows = tx
			.select()
			.from(schema.shoppingPushHistory)
			.where(eq(schema.shoppingPushHistory.weekStartDate, weekStart))
			.orderBy(desc(schema.shoppingPushHistory.createdAt))
			.limit(5)
			.all();
		const pushIds = pushRows.map((row) => row.id);
		const pushItems = pushIds.length
			? tx
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
		return {
			weekStart,
			prevWeek: addDays(weekStart, -7),
			nextWeek: addDays(weekStart, 7),
			isCurrentWeek: weekStart === weekStartFor(todayIso(), prefs.weekStartDay),
			deliveryDate:
				prefs.groceryDay == null
					? null
					: deliveryDateForPlanningWeek(weekStart, prefs.groceryDay, prefs.weekStartDay),
			emptyState: meals.length === 0 ? ('no_meals' as const) : ('nothing_needed' as const),
			ah: getAHStatus(),
			shopping,
			needs,
			pushHistory: pushRows.map((row) => ({
				...row,
				items: pushItemsById.get(row.id) ?? []
			}))
		};
	});
}

function generateShoppingListInTransaction(db: DbOrTx, requestedWeek?: string) {
	const weekStartDay = getWeekStartDay(db as Db);
	const weekStart = weekStartFor(requestedWeek ?? todayIso(), weekStartDay);
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
	const needs = deriveWeekNeeds(db, meals);
	initializeShoppingSourceData(db);
	materializeShoppingWeek(db, weekStart, { weekStartDay });
	const shopping = getShoppingWeekView(db, weekStart);
	const freshSideSourceKeys = new Set<string>(
		needs.needed.flatMap((need) =>
			need.freshSideOnly ? need.sources.map((source) => source.ref.key) : []
		)
	);
	const missing = shopping.toBuy
		.filter((row) => !row.covered)
		.map((row) => ({
			source_name: row.sources[0]?.name ?? row.name,
			name: row.name,
			amount: row.amount,
			unit: row.unit,
			for_meals: [...new Set(row.sources.flatMap((source) => source.mealNames))],
			fresh_side_for_freezer_meal:
				row.sources.length > 0 &&
				row.sources.every((source) => freshSideSourceKeys.has(source.sourceKey)),
			incompatible_quantities: row.incompatibleQuantities
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

export function generateShoppingList(db: Db, requestedWeek?: string) {
	return db.transaction((tx) => generateShoppingListInTransaction(tx, requestedWeek));
}

export const shoppingService = createShoppingService(appDb);
export function shoppingWeekStartDay(): number {
	return getWeekStartDay(appDb);
}
export function saveAhFavorite(input: {
	dutchTerm: string;
	productId: string;
	productName: string;
}): void {
	upsertAhFavorite(appDb, {
		nameKey: normalizeAhDutchTerm(input.dutchTerm),
		productId: input.productId,
		productName: input.productName
	});
}
export function removeAhFavorite(dutchTerm: string): void {
	deleteAhFavorite(appDb, normalizeAhDutchTerm(dutchTerm));
}
export function loadShoppingPage(weekParam: string | null) {
	return loadShoppingPageData(appDb, weekParam);
}
