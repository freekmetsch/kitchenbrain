import { and, asc, desc, eq, inArray, isNull, lte, or, gte } from 'drizzle-orm';
import { normalizeNameKey, tokenize } from '$lib/match';
import { sumCompatibleQuantities } from '$lib/recipe_scale';
import * as schema from '$lib/server/db/schema';
import type { DbOrTx } from '$lib/server/db/types';
type WeekEntry = typeof schema.shoppingWeekEntries.$inferSelect;
export type RecipeAhPreference = typeof schema.recipeAhPreferences.$inferSelect;
type DB = DbOrTx;

export function getShoppingWeekEntry(
	db: DB,
	entryId: number
): WeekEntry | undefined {
	return db
		.select()
		.from(schema.shoppingWeekEntries)
		.where(eq(schema.shoppingWeekEntries.id, entryId))
		.get();
}

export function getActiveShoppingEntryBySource(
	db: DB,
	weekStartDate: string,
	sourceKey: string
): WeekEntry | undefined {
	return db
		.select()
		.from(schema.shoppingWeekEntries)
		.where(
			and(
				eq(schema.shoppingWeekEntries.weekStartDate, weekStartDate),
				eq(schema.shoppingWeekEntries.sourceKey, sourceKey),
				isNull(schema.shoppingWeekEntries.retiredAt)
			)
		)
		.get();
}

export function listAhFavorites(db: DB) {
	return db.select().from(schema.ahFavorites).all();
}

export function listRecipeAhPreferences(db: DB) {
	return db.select().from(schema.recipeAhPreferences).all();
}

export function listRecipeAhPreferencesForSources(
	db: DB,
	sources: Array<{ recipeId: number | null; ingredientId: string | null }>
) {
	const recipeIds = [...new Set(sources.flatMap((source) => source.recipeId == null ? [] : [source.recipeId]))];
	if (recipeIds.length === 0) return [];
	const rows = db
		.select()
		.from(schema.recipeAhPreferences)
		.where(inArray(schema.recipeAhPreferences.recipeId, recipeIds))
		.all();
	const sourceKeys = new Set(
		sources.flatMap((source) =>
			source.recipeId == null || !source.ingredientId
				? []
				: [`${source.recipeId}\u0000${source.ingredientId}`]
		)
	);
	return rows.filter((row) => sourceKeys.has(`${row.recipeId}\u0000${row.ingredientId}`));
}

export function listRecentShoppingPushes(
	db: DB,
	weekStartDate: string,
	limit: number
) {
	const pushRows = db
		.select()
		.from(schema.shoppingPushHistory)
		.where(eq(schema.shoppingPushHistory.weekStartDate, weekStartDate))
		.orderBy(desc(schema.shoppingPushHistory.createdAt))
		.limit(limit)
		.all();
	const pushIds = pushRows.map((row) => row.id);
	const pushItems = pushIds.length
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
	return pushRows.map((row) => ({
		...row,
		items: pushItemsById.get(row.id) ?? []
	}));
}

function inventoryMatchKey(name: string): string {
	return [...new Set(tokenize(name))].sort().join('\u0000');
}

export type ShoppingSourceView = {
	id: number;
	revision: number;
	sourceKey: string;
	sourceKind: WeekEntry['sourceKind'];
	recipeId: number | null;
	recipeSlug: string | null;
	recipeTitle: string | null;
	recipeRevision: number | null;
	ingredientId: string | null;
	recurringItemId: number | null;
	name: string;
	term: string;
	amount: string | null;
	unit: string | null;
	amountOverridden: boolean;
	derivedAmount: string | null;
	derivedUnit: string | null;
	component: string | null;
	mealIds: number[];
	mealNames: string[];
	approvedTerms: string[];
	included: boolean;
	bought: boolean;
	optional: boolean;
	staple: boolean;
	purchaseForm?: 'fresh' | 'preserved' | 'frozen' | 'dried' | 'any';
	needsReview: boolean;
};

export type ShoppingBuyRow = {
	key: string;
	name: string;
	amount: string | null;
	unit: string | null;
	bought: boolean;
	covered: boolean;
	entryIds: number[];
	sources: ShoppingSourceView[];
	incompatibleQuantities: boolean;
};

export type RecurringShoppingView = {
	id: number;
	revision: number;
	name: string;
	amount: string | null;
	unit: string | null;
	startWeek: string;
	endWeek: string | null;
	entryId: number | null;
	entryRevision: number | null;
	included: boolean;
	bought: boolean;
};

export type LegacyShoppingView = ShoppingSourceView & {
	candidates: Array<{ id: number; revision: number; label: string }>;
};

export type ShoppingWeekView = {
	sources: ShoppingSourceView[];
	toBuy: ShoppingBuyRow[];
	done: ShoppingBuyRow[];
	recurring: RecurringShoppingView[];
	legacy: LegacyShoppingView[];
	excluded: Array<{ weekStart: string; nameKey: string; name: string }>;
};

function ingredientState(entry: WeekEntry, recipesById: Map<number, typeof schema.recipes.$inferSelect>) {
	if (entry.recipeId == null || !entry.ingredientId) return { optional: false, recipeTitle: null, purchaseForm: undefined };
	const recipe = recipesById.get(entry.recipeId);
	const ingredient = (recipe?.ingredients ?? []).find((candidate) => candidate.id === entry.ingredientId);
	return { optional: ingredient?.optional === true, recipeTitle: recipe?.title ?? null, purchaseForm: ingredient?.purchaseForm };
}

function effectiveAmount(entry: WeekEntry): { amount: string | null; unit: string | null } {
	return {
		amount: entry.amountOverride ?? entry.amount,
		unit: entry.unitOverride ?? entry.unit
	};
}

function aggregateRows(sources: ShoppingSourceView[], inventoryNames: string[]): ShoppingBuyRow[] {
	const rows: ShoppingBuyRow[] = [];
	const rowsByTerm = new Map<string, ShoppingBuyRow>();
	const inventoryKeys = new Set(inventoryNames.map(inventoryMatchKey).filter(Boolean));
	for (const source of sources.filter((entry) => entry.included && !entry.needsReview)) {
		const termKey = normalizeNameKey(source.term);
		let target = rowsByTerm.get(termKey);
		if (!target) {
			target = {
				key: `${termKey}:0`,
				name: source.term,
				amount: source.amount,
				unit: source.unit,
				bought: source.bought,
				covered: inventoryKeys.has(inventoryMatchKey(source.term)),
				entryIds: [source.id],
				sources: [source],
				incompatibleQuantities: false
			};
			rowsByTerm.set(termKey, target);
			rows.push(target);
			continue;
		}
		target.sources.push(source);
		target.entryIds.push(source.id);
		target.bought = target.sources.every((item) => item.bought);
		const sum = sumCompatibleQuantities(
			target.sources.map((item) => ({ amount: item.amount ?? '', unit: item.unit ?? undefined }))
		);
		if (sum) {
			target.amount = sum.amount;
			target.unit = sum.unit ?? null;
			target.incompatibleQuantities = false;
		} else {
			target.amount = null;
			target.unit = null;
			target.incompatibleQuantities = target.sources.some((item) => item.amount || item.unit);
		}
	}
	return rows;
}

export function getShoppingWeekView(db: DB, weekStart: string): ShoppingWeekView {
	const entries = db
		.select()
		.from(schema.shoppingWeekEntries)
		.where(and(eq(schema.shoppingWeekEntries.weekStartDate, weekStart), isNull(schema.shoppingWeekEntries.retiredAt)))
		.orderBy(asc(schema.shoppingWeekEntries.id))
		.all();
	const recipeIds = [...new Set(entries.flatMap((entry) => (entry.recipeId == null ? [] : [entry.recipeId])))];
	const recipesById = new Map(
		(recipeIds.length ? db.select().from(schema.recipes).where(inArray(schema.recipes.id, recipeIds)).all() : [])
			.map((recipe) => [recipe.id, recipe])
	);
	const mealIds = [...new Set(entries.flatMap((entry) => entry.mealIds))];
	const mealNames = new Map(
		(mealIds.length
			? db.select({ id: schema.mealPlanMeals.id, dinner: schema.mealPlanMeals.dinner })
				.from(schema.mealPlanMeals)
				.where(inArray(schema.mealPlanMeals.id, mealIds))
				.all()
			: []).map((meal) => [meal.id, meal.dinner])
	);
	const inventory = db
		.select({ name: schema.inventoryItems.name, isStaple: schema.inventoryItems.isStaple })
		.from(schema.inventoryItems)
		.where(isNull(schema.inventoryItems.deletedAt))
		.all();
	const stapleKeys = new Set(inventory.filter((item) => item.isStaple).map((item) => normalizeNameKey(item.name)));

	const sources: ShoppingSourceView[] = entries.map((entry) => {
		const state = ingredientState(entry, recipesById);
		const quantity = effectiveAmount(entry);
		return {
			id: entry.id,
			revision: entry.revision,
			sourceKey: entry.sourceKey,
			sourceKind: entry.sourceKind,
			recipeId: entry.recipeId,
			recipeSlug: entry.recipeSlug,
			recipeTitle: state.recipeTitle,
			recipeRevision: entry.recipeId == null ? null : recipesById.get(entry.recipeId)?.contentRevision ?? null,
			ingredientId: entry.ingredientId,
			recurringItemId: entry.recurringItemId,
			name: entry.name,
			term: entry.selectedName ?? entry.name,
			amount: quantity.amount,
			unit: quantity.unit,
			amountOverridden: entry.amountOverride != null || entry.unitOverride != null,
			derivedAmount: entry.amount,
			derivedUnit: entry.unit,
			component: entry.component,
			mealIds: entry.mealIds,
			mealNames: entry.mealIds.flatMap((id) => (mealNames.has(id) ? [mealNames.get(id)!] : [])),
			approvedTerms: entry.approvedTerms,
			included: entry.included,
			bought: entry.bought,
			optional: state.optional,
			staple: stapleKeys.has(normalizeNameKey(entry.name)),
			purchaseForm: state.purchaseForm,
			needsReview: entry.needsReview
		};
	});

	const activeSources = sources.filter((source) => source.sourceKind !== 'legacy');
	const aggregate = aggregateRows(activeSources, inventory.map((item) => item.name));
	const excluded = db
		.select()
		.from(schema.shoppingWeekExclusions)
		.where(eq(schema.shoppingWeekExclusions.weekStartDate, weekStart))
		.orderBy(asc(schema.shoppingWeekExclusions.name))
		.all()
		.map((entry) => ({
			weekStart: entry.weekStartDate,
			nameKey: entry.nameKey,
			name: entry.name
		}));
	const excludedKeys = new Set(excluded.map((entry) => entry.nameKey));
	const visibleAggregate = aggregate.filter((row) => !excludedKeys.has(normalizeNameKey(row.name)));
	const recurringRows = db
		.select()
		.from(schema.recurringShoppingItems)
		.where(
			and(
				lte(schema.recurringShoppingItems.startWeek, weekStart),
				or(isNull(schema.recurringShoppingItems.endWeek), gte(schema.recurringShoppingItems.endWeek, weekStart))
			)
		)
		.orderBy(asc(schema.recurringShoppingItems.id))
		.all();
	const recurring = recurringRows.map((item): RecurringShoppingView => {
		const occurrence = sources.find((source) => source.sourceKey === `weekly:${item.id}`);
		return {
			...item,
			entryId: occurrence?.id ?? null,
			entryRevision: occurrence?.revision ?? null,
			included: occurrence?.included ?? true,
			bought: occurrence?.bought ?? false
		};
	});
	const candidates = sources.filter((source) => source.sourceKind !== 'legacy');
	const legacy = sources
		.filter((source): source is ShoppingSourceView => source.sourceKind === 'legacy' && source.needsReview)
		.map((source): LegacyShoppingView => ({
			...source,
			candidates: candidates
				.filter((candidate) =>
					normalizeNameKey(candidate.name) === normalizeNameKey(source.name) ||
					candidate.approvedTerms.some((term) => normalizeNameKey(term) === normalizeNameKey(source.term))
				)
				.map((candidate) => ({
					id: candidate.id,
					revision: candidate.revision,
					label: [candidate.recipeTitle ?? candidate.name, candidate.component].filter(Boolean).join(' · ')
				}))
		}));

	return {
		sources: activeSources,
		toBuy: visibleAggregate.filter((row) => !row.bought),
		done: visibleAggregate.filter((row) => row.bought),
		recurring,
		legacy,
		excluded
	};
}
