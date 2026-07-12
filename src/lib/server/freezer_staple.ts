// Keep-stocked bookkeeping (UX-STOCK-14). One write path for the freezer-staple
// flag so the opt-out memory stays consistent across every surface that toggles
// it (recipe page, chat agent, stock-row editor, ghost rows). Toggling off
// records the opt-out so the next freeze/link does not silently re-enable the
// staple (cooked once, didn't like it); toggling on clears it.
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type { DbOrTx } from '$lib/server/inventory_merge';

export function setFreezerStaple(
	db: DbOrTx,
	recipeId: number,
	on: boolean,
	targetPortions?: number | null
): void {
	const updates: Record<string, unknown> = {
		isFreezerStaple: on,
		freezerStapleOptOut: !on,
		updatedAt: new Date()
	};
	// Clearing the flag always drops the target; setting it only touches the
	// target when the caller sent one.
	if (!on) updates.targetPortions = null;
	else if (targetPortions !== undefined) updates.targetPortions = targetPortions;
	db.update(schema.recipes).set(updates).where(eq(schema.recipes.id, recipeId)).run();
}

/**
 * Auto-staple on link: a leftover linked to a recipe means the household batch-
 * cooks it, so the recipe becomes a freezer staple by default. Idempotent and
 * opt-out-aware — safe to call on every write that leaves an item as a linked
 * leftover. Defaults targetPortions to max(frozen portions on hand, servings)
 * only when no target is set yet; never overwrites a user-chosen target.
 */
export function autoStapleOnLink(db: DbOrTx, recipeId: number): void {
	const recipe = db
		.select({
			isFreezerStaple: schema.recipes.isFreezerStaple,
			freezerStapleOptOut: schema.recipes.freezerStapleOptOut,
			targetPortions: schema.recipes.targetPortions,
			servings: schema.recipes.servings
		})
		.from(schema.recipes)
		.where(eq(schema.recipes.id, recipeId))
		.get();
	if (!recipe || recipe.freezerStapleOptOut) return;

	const updates: Record<string, unknown> = {};
	if (!recipe.isFreezerStaple) updates.isFreezerStaple = true;
	if (recipe.targetPortions == null) {
		const rows = db
			.select({ qtyNum: schema.inventoryItems.qtyNum })
			.from(schema.inventoryItems)
			.where(
				and(
					isNull(schema.inventoryItems.deletedAt),
					eq(schema.inventoryItems.kind, 'leftover'),
					eq(schema.inventoryItems.section, 'freezer'),
					eq(schema.inventoryItems.madeFromRecipeId, recipeId)
				)
			)
			.all();
		const onHand = rows.reduce((sum, r) => sum + (r.qtyNum ?? 0), 0);
		const target = Math.round(Math.max(onHand, recipe.servings ?? 0));
		if (target > 0) updates.targetPortions = target;
	}
	if (Object.keys(updates).length > 0) {
		updates.updatedAt = new Date();
		db.update(schema.recipes).set(updates).where(eq(schema.recipes.id, recipeId)).run();
	}
}
