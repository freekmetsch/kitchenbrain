import { and, eq, isNotNull, isNull, like, lte } from 'drizzle-orm';
import { normalizeFoodCategory } from '$lib/food_categories';
import { dateInputValue, daysSinceDate } from '$lib/inventory_dates';
import { addDays, todayIso } from '$lib/week';
import * as schema from '$lib/server/db/schema';
import type { DbOrTx } from '$lib/server/db/types';
import { readInventoryItem } from './merge';

type InventoryItem = typeof schema.inventoryItems.$inferSelect;

export type InventoryListOptions = {
	section?: 'freezer' | 'pantry';
	category?: string;
	expiringWithinDays?: number;
	addedBeforeDays?: number;
	sort?: 'name' | 'oldest_added' | 'newest_added';
};

export function listInventory(db: DbOrTx, options: InventoryListOptions = {}): InventoryItem[] {
	const categoryFilter = normalizeFoodCategory(options.category);
	let items = db
		.select()
		.from(schema.inventoryItems)
		.where(
			and(
				isNull(schema.inventoryItems.deletedAt),
				options.section ? eq(schema.inventoryItems.section, options.section) : undefined,
				categoryFilter ? like(schema.inventoryItems.category, `%${categoryFilter}%`) : undefined,
				options.expiringWithinDays !== undefined
					? and(
							isNotNull(schema.inventoryItems.expiryDate),
							lte(schema.inventoryItems.expiryDate, addDays(todayIso(), options.expiringWithinDays))
						)
					: undefined
			)
		)
		.all();

	if (options.addedBeforeDays !== undefined) {
		items = items.filter((item) => {
			const days = daysSinceDate(item.createdAt);
			return days !== null && days >= options.addedBeforeDays!;
		});
	}
	if (options.sort === 'oldest_added') {
		return items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
	}
	if (options.sort === 'newest_added') {
		return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	}
	return items.sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

export function inventoryForAi(item: InventoryItem) {
	const { tags: _tags, ...rest } = item;
	return {
		...rest,
		added_date: dateInputValue(item.createdAt),
		days_in_inventory: daysSinceDate(item.createdAt)
	};
}

export function getInventoryItem(db: DbOrTx, id: number): InventoryItem | undefined {
	return readInventoryItem(db, id);
}

export function listActiveInventoryNames(db: DbOrTx): string[] {
	return db
		.select({ name: schema.inventoryItems.name })
		.from(schema.inventoryItems)
		.where(isNull(schema.inventoryItems.deletedAt))
		.all()
		.map((row) => row.name);
}

export function listInventorySuggestionRows(db: DbOrTx) {
	return db
		.select({
			name: schema.inventoryItems.name,
			qty: schema.inventoryItems.qtyText,
			section: schema.inventoryItems.section,
			category: schema.inventoryItems.category,
			expiryDate: schema.inventoryItems.expiryDate,
			createdAt: schema.inventoryItems.createdAt
		})
		.from(schema.inventoryItems)
		.where(isNull(schema.inventoryItems.deletedAt))
		.all();
}
