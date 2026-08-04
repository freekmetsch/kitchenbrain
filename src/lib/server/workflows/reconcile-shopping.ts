import { db as appDb } from '$lib/server/db/index';
import type { Db, DbOrTx } from '$lib/server/db/types';
import {
	listMealsForWeekInSourceOrder,
	listMealsForWeekUnordered
} from '$lib/server/domains/meal-plan/queries';
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
	setRecurringShoppingEntryIncluded,
	updateShoppingEntry,
	upsertAhFavorite,
	getShoppingWeekEntry,
	getShoppingWeekView,
	listRecentShoppingPushes,
	excludeShoppingWeekAggregate,
	restoreShoppingWeekAggregate
} from '$lib/server/domains/shopping';
import { getMealPlanPrefs, getWeekStartDay } from '$lib/server/meal_plan/prefs';
import {
	addDays,
	deliveryDateForPlanningWeek,
	isIsoDate,
	todayIso,
	weekStartFor
} from '$lib/week';
import { deriveWeekNeeds } from './shopping-needs';
import { getRecipesBySlugs } from '$lib/server/domains/recipes';
import { frozenPortionsByRecipe } from '$lib/server/domains/inventory/freezer';
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
	const meals = listMealsForWeekInSourceOrder(db, weekStart);
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
		setRecurringIncluded(input: Parameters<typeof setRecurringShoppingEntryIncluded>[1]) {
			return inTransaction((tx) => {
				initializeShoppingSourceData(tx);
				return setRecurringShoppingEntryIncluded(tx, input);
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
				const before = getShoppingWeekEntry(tx, input.entryId);
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
		excludeWeekItem(input: Parameters<typeof excludeShoppingWeekAggregate>[1]) {
			return inTransaction((tx) => excludeShoppingWeekAggregate(tx, input));
		},
		restoreWeekItem(input: Parameters<typeof restoreShoppingWeekAggregate>[1]) {
			return inTransaction((tx) => restoreShoppingWeekAggregate(tx, input));
		},
		resolveLegacy(input: Parameters<typeof resolveLegacyShoppingEntry>[1]) {
			return inTransaction((tx) => {
				initializeShoppingSourceData(tx);
				return resolveLegacyShoppingEntry(tx, input);
			});
		}
	};
}

export function resolveShoppingWeek(input: {
	requestedWeek: string | null;
	today: string;
	weekStartDay: number;
	groceryDay: number | null;
}): string {
	if (isIsoDate(input.requestedWeek)) {
		return weekStartFor(input.requestedWeek, input.weekStartDay);
	}

	const currentPlanningWeek = weekStartFor(input.today, input.weekStartDay);
	if (input.groceryDay == null) return currentPlanningWeek;

	const deliveryDate = deliveryDateForPlanningWeek(
		currentPlanningWeek,
		input.groceryDay,
		input.weekStartDay
	);
	return deliveryDate < input.today ? addDays(currentPlanningWeek, 7) : currentPlanningWeek;
}

export function isShoppingWeekEditable(input: {
	weekStart: string;
	today: string;
	weekStartDay: number;
}): boolean {
	return input.weekStart >= weekStartFor(input.today, input.weekStartDay);
}

export function loadShoppingPageData(db: Db, weekParam: string | null) {
	const prefs = getMealPlanPrefs(db);
	const today = todayIso();
	const currentWeekStart = weekStartFor(today, prefs.weekStartDay);
	const defaultWeek = resolveShoppingWeek({
		requestedWeek: null,
		today,
		weekStartDay: prefs.weekStartDay,
		groceryDay: prefs.groceryDay
	});
	const weekStart = resolveShoppingWeek({
		requestedWeek: weekParam,
		today,
		weekStartDay: prefs.weekStartDay,
		groceryDay: prefs.groceryDay
	});
	return db.transaction((tx) => {
		initializeShoppingSourceData(tx);
		materializeShoppingWeek(tx, weekStart, { weekStartDay: prefs.weekStartDay });
		const meals = listMealsForWeekUnordered(tx, weekStart);
		const recipesBySlug = new Map(
			getRecipesBySlugs(
				tx,
				[...new Set(meals.flatMap((meal) => (meal.recipeSlug ? [meal.recipeSlug] : [])))]
			).map((recipe) => [recipe.slug, recipe])
		);
		const frozenByRecipe = frozenPortionsByRecipe(tx);
		const needs = deriveWeekNeeds(tx, meals);
		const shopping = getShoppingWeekView(tx, weekStart);
		const activeMealIds = new Set(
			[...shopping.toBuy, ...shopping.done].flatMap((row) =>
				row.sources.flatMap((source) => source.mealIds)
			)
		);
		const pushHistory = listRecentShoppingPushes(tx, weekStart, 5);
		return {
			weekStart,
			currentWeekStart,
			prevWeek: addDays(weekStart, -7),
			nextWeek: addDays(weekStart, 7),
			isDefaultWeek: weekStart === defaultWeek,
			isEditable: isShoppingWeekEditable({
				weekStart,
				today,
				weekStartDay: prefs.weekStartDay
			}),
			deliveryDate:
				prefs.groceryDay == null
					? null
					: deliveryDateForPlanningWeek(weekStart, prefs.groceryDay, prefs.weekStartDay),
			emptyState: meals.length === 0 ? ('no_meals' as const) : ('nothing_needed' as const),
			ah: getAHStatus(),
			shopping,
			plannedMeals: meals.flatMap((meal) =>
				meal.recipeSlug == null || meal.servings == null
					? []
					: (() => {
							const recipe = recipesBySlug.get(meal.recipeSlug);
							if (!recipe) return [];
							return [
							{
								id: meal.id,
								dinner: meal.dinner,
								recipeSlug: meal.recipeSlug,
								servings: meal.servings,
								baselineServings: recipe.servings ?? 4,
								frozenPortions: frozenByRecipe.get(recipe.id) ?? 0,
								scalingMode: recipe.scalingMode,
								status: meal.status,
								source: meal.source,
								plannedDate: meal.plannedDate,
								note: meal.note,
								contributesActiveItems: activeMealIds.has(meal.id)
							}
						];
						})()
			),
			needs,
			pushHistory
		};
	});
}

function generateShoppingListInTransaction(db: DbOrTx, requestedWeek?: string) {
	const weekStartDay = getWeekStartDay(db);
	const weekStart = weekStartFor(requestedWeek ?? todayIso(), weekStartDay);
	const meals = listMealsForWeekUnordered(db, weekStart);
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
