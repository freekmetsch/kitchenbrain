import { and, asc, isNotNull, isNull, lte } from 'drizzle-orm';
import { addDays, weekStartFor } from '$lib/week';
import * as schema from '$lib/server/db/schema';
import type { Db } from '$lib/server/db/types';
import { listFreezerStaples } from '$lib/server/domains/inventory/freezer';
import { listMealsForWeekUnordered } from '$lib/server/domains/meal-plan/queries';
import { getShoppingWeekView } from '$lib/server/domains/shopping';
import type { ButlerSnapshot } from './brief';

export function buildButlerSnapshot(
	db: Db,
	options: { today: string; weekStartDay: number }
): ButlerSnapshot {
	const { today, weekStartDay } = options;
	const weekStart = weekStartFor(today, weekStartDay);
	const shopping = getShoppingWeekView(db, weekStart);
	const shoppingRows = [...shopping.toBuy, ...shopping.done];

	return {
		today,
		weekStart,
		expiring: db
			.select({
				id: schema.inventoryItems.id,
				name: schema.inventoryItems.name,
				expiryDate: schema.inventoryItems.expiryDate,
				section: schema.inventoryItems.section
			})
			.from(schema.inventoryItems)
			.where(
				and(
					isNull(schema.inventoryItems.deletedAt),
					isNotNull(schema.inventoryItems.expiryDate),
					lte(schema.inventoryItems.expiryDate, addDays(today, 7))
				)
			)
			.orderBy(asc(schema.inventoryItems.expiryDate), asc(schema.inventoryItems.id))
			.limit(5)
			.all()
			.map((item) => ({ ...item, expiryDate: item.expiryDate! })),
		plannedMeals: listMealsForWeekUnordered(db, weekStart).length,
		shopping: {
			toBuy: shopping.toBuy.length,
			conflicts: shoppingRows.filter((row) => row.incompatibleQuantities).length,
			sourcesNeedingReview:
				shopping.sources.filter((source) => source.needsReview).length + shopping.legacy.length
		},
		freezerTargets: listFreezerStaples(db).flatMap((target) =>
			target.target_portions == null
				? []
				: [
						{
							recipeSlug: target.slug,
							title: target.title,
							currentPortions: target.on_hand_portions,
							targetPortions: target.target_portions
						}
					]
		),
		// Proposal modules are intentionally request-local today. Durable reviews
		// join this projection only after their append-only state migration.
		pendingReviews: 0
	};
}
