// Per-table destructive reset for Settings → Data (FEATURE_LIST_SETTINGS_MENU.md
// Phase 3). Every group runs inside one synchronous db.transaction() so a
// partial failure never leaves a group half-emptied (Correctness Req #1).
// Never-resettable: users, sessions, household_prefs, prefs — deliberately
// absent from RESET_GROUPS below, not just unwired in the UI.
import { count, getTableName } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { AnySQLiteTable } from 'drizzle-orm/sqlite-core';
import * as schema from '$lib/server/db/schema';
import { delHouseholdPref } from '$lib/server/db/household_prefs';
import { K_SHOPPING_SOURCE_MIGRATION } from '$lib/server/shopping_entries';

type DB = BetterSQLite3Database<typeof schema>;

export type ResetGroupKey =
	| 'inventory'
	| 'recipes'
	| 'meal_history'
	| 'chat_history'
	| 'spending_log'
	| 'shopping_data'
	| 'ah_favorites';

export const RESET_GROUP_KEYS: ResetGroupKey[] = [
	'inventory',
	'recipes',
	'meal_history',
	'chat_history',
	'spending_log',
	'shopping_data',
	'ah_favorites'
];

export const RESET_GROUPS: Record<ResetGroupKey, { label: string; description: string }> = {
	inventory: {
		label: 'Inventory',
		description: 'Freezer and pantry items, plus their add/remove/update history.'
	},
	recipes: {
		label: 'Recipes',
		description:
			'All recipes. Inventory items and cook-log entries that link to a deleted recipe are unlinked, not deleted.'
	},
	meal_history: {
		label: 'Meal history & planning',
		description: 'The meal plan, cook log, and legacy meal log entries.'
	},
	chat_history: {
		label: 'Chat History',
		description: 'The AI chat conversation log.'
	},
	spending_log: {
		label: 'Spending Log',
		description: 'The per-request AI spend ledger used for the daily caps.'
	},
	shopping_data: {
		label: 'Shopping data',
		description: 'Shopping list overrides and Albert Heijn push history.'
	},
	ah_favorites: {
		label: 'AH Favorites',
		description: 'Pinned Albert Heijn products per ingredient name.'
	}
};

// Single source of truth for both delete order (resetGroup) and row counts
// (countGroupRows) — array order matters where a group's own tables have an
// inbound FK between them (meal_history: cook_log must go before
// meal_plan_meals). Groups with no such dependency are still just a delete-
// per-table loop, no per-group special case needed.
const GROUP_TABLES: Record<ResetGroupKey, AnySQLiteTable[]> = {
	inventory: [schema.inventoryOpsLog, schema.inventoryItems],
	recipes: [schema.recipes],
	meal_history: [schema.cookLog, schema.mealPlanMeals, schema.mealLog],
	chat_history: [schema.chatMessages],
	spending_log: [schema.spending],
	// shopping_push_items cascades from shopping_push_history — no separate entry.
	shopping_data: [
		schema.shoppingWeekEntries,
		schema.recurringShoppingItems,
		schema.shoppingListOverrides,
		schema.shoppingPushHistory
	],
	ah_favorites: [schema.ahFavorites]
};

export type ResetResult = { group: ResetGroupKey; deleted: Record<string, number> };

/**
 * Deletes every row in the given group's tables, handling the FK ordering the
 * schema requires. Runs inside its own transaction — callers never need to
 * wrap this again.
 */
export function resetGroup(db: DB, key: ResetGroupKey): ResetResult {
	return db.transaction((tx): ResetResult => {
		// FK preludes for the two groups whose tables are referenced from OUTSIDE
		// the group with no cascade — nulling first is the only way to delete the
		// referenced rows without also deleting the referencing table's rows.
		if (key === 'inventory') {
			// Self-referencing FK (undo_of → inventory_ops_log.id) must be nulled
			// before the rows can be deleted, or the last remaining referenced row
			// fails the FK check (Correctness Req #6).
			tx.update(schema.inventoryOpsLog).set({ undoOf: null }).run();
		}
		if (key === 'recipes') {
			// inventory_items.made_from_recipe_id and cook_log.recipe_id both
			// reference recipes with no cascade — null them first even though
			// neither table is in this group. meal_sub_recipes cascades on its
			// own (declared ON DELETE CASCADE), no action needed here.
			tx.update(schema.inventoryItems).set({ madeFromRecipeId: null }).run();
			tx.update(schema.cookLog).set({ recipeId: null }).run();
		}

		const deleted: Record<string, number> = {};
		for (const table of GROUP_TABLES[key]) {
			deleted[getTableName(table)] = tx.delete(table).run().changes;
		}
		if (key === 'shopping_data') delHouseholdPref(tx as unknown as DB, K_SHOPPING_SOURCE_MIGRATION);
		return { group: key, deleted };
	});
}

// Exported for import.ts's isBootstrapEligible — one "count rows in a table"
// implementation shared by both reset and import.
export function rowCount(db: DB, table: AnySQLiteTable): number {
	return db.select({ n: count() }).from(table).get()!.n;
}

/** Row count per group, for the Settings panel's "N items" display. */
export function countGroupRows(db: DB): Record<ResetGroupKey, number> {
	const counts = {} as Record<ResetGroupKey, number>;
	for (const key of RESET_GROUP_KEYS) {
		counts[key] = GROUP_TABLES[key].reduce((sum, table) => sum + rowCount(db, table), 0);
	}
	return counts;
}
