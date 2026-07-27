// Inventory ↔ freezer-recipe bookkeeping (UX-STOCK-14).
// flag so the opt-out memory stays consistent across every surface that toggles
// it (recipe page, chat agent, stock-row editor, ghost rows). Toggling off
// records the opt-out so the next freeze/link does not silently re-enable the
// staple (cooked once, didn't like it); toggling on clears it.
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type { DbOrTx } from '$lib/server/db/types';
import { titlesMatch } from '$lib/match';

export type RecipeTitleRow = { id: number; slug: string; title: string; titleEn: string | null };
export type RecipeSuggestion = { id: number; slug: string; title: string };
export type FreezerStapleInfo = {
	isFreezerStaple: boolean;
	targetPortions: number | null;
	onHandPortions: number;
};
export type StapleGhost = { recipeId: number; slug: string; title: string; target: number | null };

export function frozenPortionsByRecipe(db: DbOrTx): Map<number, number> {
	const rows = db
		.select({
			recipeId: schema.inventoryItems.madeFromRecipeId,
			qtyNum: schema.inventoryItems.qtyNum
		})
		.from(schema.inventoryItems)
		.where(
			and(
				isNull(schema.inventoryItems.deletedAt),
				eq(schema.inventoryItems.kind, 'leftover'),
				eq(schema.inventoryItems.section, 'freezer'),
				isNotNull(schema.inventoryItems.madeFromRecipeId)
			)
		)
		.all();
	const portions = new Map<number, number>();
	for (const row of rows) {
		if (row.recipeId == null) continue;
		portions.set(row.recipeId, (portions.get(row.recipeId) ?? 0) + (row.qtyNum ?? 0));
	}
	return portions;
}

export function listFreezerStaples(db: DbOrTx) {
	const onHand = frozenPortionsByRecipe(db);
	return db
		.select({
			id: schema.recipes.id,
			slug: schema.recipes.slug,
			title: schema.recipes.title,
			targetPortions: schema.recipes.targetPortions
		})
		.from(schema.recipes)
		.where(eq(schema.recipes.isFreezerStaple, true))
		.all()
		.map((recipe) => {
			const current = onHand.get(recipe.id) ?? 0;
			return {
				slug: recipe.slug,
				title: recipe.title,
				target_portions: recipe.targetPortions,
				on_hand_portions: current,
				below_target: recipe.targetPortions != null && current < recipe.targetPortions
			};
		});
}

export function recipeSuggestionsForName(
	name: string,
	recipes: RecipeTitleRow[],
	limit = 3
): RecipeSuggestion[] {
	return recipes
		.filter((recipe) =>
			titlesMatch(name, recipe.title) || (recipe.titleEn ? titlesMatch(name, recipe.titleEn) : false)
		)
		.slice(0, limit)
		.map((recipe) => ({
			id: recipe.id,
			slug: recipe.slug,
			title: recipe.titleEn ?? recipe.title
		}));
}

export function recipeTitleRows(db: DbOrTx): RecipeTitleRow[] {
	return db
		.select({
			id: schema.recipes.id,
			slug: schema.recipes.slug,
			title: schema.recipes.title,
			titleEn: schema.recipes.titleEn
		})
		.from(schema.recipes)
		.all();
}

export function recipeIdForSlug(db: DbOrTx, slug: string): number | null {
	return db
		.select({ id: schema.recipes.id })
		.from(schema.recipes)
		.where(eq(schema.recipes.slug, slug))
		.get()?.id ?? null;
}

export function freezerStapleInfoByRecipe(
	db: DbOrTx,
	recipeIds: number[],
	precomputedOnHand?: Map<number, number>
): Map<number, FreezerStapleInfo> {
	const info = new Map<number, FreezerStapleInfo>();
	if (!recipeIds.length) return info;
	const onHand = precomputedOnHand ?? frozenPortionsByRecipe(db);
	const rows = db
		.select({
			id: schema.recipes.id,
			isFreezerStaple: schema.recipes.isFreezerStaple,
			targetPortions: schema.recipes.targetPortions
		})
		.from(schema.recipes)
		.where(inArray(schema.recipes.id, recipeIds))
		.all();
	for (const row of rows) {
		info.set(row.id, {
			isFreezerStaple: row.isFreezerStaple,
			targetPortions: row.targetPortions,
			onHandPortions: onHand.get(row.id) ?? 0
		});
	}
	return info;
}

export function stapleGhostRows(db: DbOrTx, liveLinkedRecipeIds: Set<number>): StapleGhost[] {
	return db
		.select({
			id: schema.recipes.id,
			slug: schema.recipes.slug,
			title: schema.recipes.title,
			titleEn: schema.recipes.titleEn,
			targetPortions: schema.recipes.targetPortions
		})
		.from(schema.recipes)
		.where(eq(schema.recipes.isFreezerStaple, true))
		.all()
		.filter((recipe) => !liveLinkedRecipeIds.has(recipe.id))
		.map((recipe) => ({
			recipeId: recipe.id,
			slug: recipe.slug,
			title: recipe.titleEn ?? recipe.title,
			target: recipe.targetPortions
		}))
		.sort((a, b) => a.title.localeCompare(b.title, 'en'));
}

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
