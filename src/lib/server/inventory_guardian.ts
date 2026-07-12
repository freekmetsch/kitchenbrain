// Taxonomy guardian sweep (P3.2): deterministic, idempotent pass over active
// inventory. Fills confidently-inferable facets (recipe-linked -> leftover,
// known name token -> food class) and flags whatever stays unclassified for
// the review queue. All writes go through the inventory_writes boundary so
// every change is logged, attributed to 'pipeline', and undoable — no raw
// SQL writes here (architectural guard, P1.5).
import { isNull } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';
import { inferFoodClassFromName, isUnclassified } from '$lib/food_class';
import {
	setReviewFlag,
	updateInventory,
	type UpdateInventoryInput,
	type WriteCtx
} from '$lib/server/inventory_writes';

type DB = BetterSQLite3Database<typeof schema>;

const CTX: WriteCtx = { actor: 'pipeline' };

export function runTaxonomyGuardianSweep(db: DB): { classified: number; flagged: number } {
	const items = db
		.select()
		.from(schema.inventoryItems)
		.where(isNull(schema.inventoryItems.deletedAt))
		.all();

	let classified = 0;
	let flagged = 0;

	for (const item of items) {
		let current = item;

		if (isUnclassified(current.kind, current.foodClass)) {
			const updates: UpdateInventoryInput = {};
			if (current.kind === null && current.madeFromRecipeId != null) updates.kind = 'leftover';
			if (current.foodClass === null) {
				const inferred = inferFoodClassFromName(current.name);
				if (inferred) updates.foodClass = inferred;
			}
			if (Object.keys(updates).length > 0) {
				const result = updateInventory(db, current.id, updates, CTX);
				if (result.ok) {
					classified++;
					current = result.item;
				}
			}
		}

		// Still unclassified after inference: flag once for the review queue.
		// Items already flagged (for any reason) are never re-flagged.
		if (isUnclassified(current.kind, current.foodClass) && !current.needsReview) {
			if (setReviewFlag(db, current.id, 'unclassified', CTX).ok) flagged++;
		}
	}

	return { classified, flagged };
}
