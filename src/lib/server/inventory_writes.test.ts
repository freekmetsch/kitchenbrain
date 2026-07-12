import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb, type TestDb } from './test_db';
import { setFreezerStaple } from './freezer_staple';
import {
	addInventory,
	removeInventory,
	setReviewFlag,
	undoLatestRemoveForItem,
	undoOp,
	updateInventory
} from './inventory_writes';

const CTX = { actor: 'alice' as const, userId: 1 };

function ops(db: TestDb) {
	return db.select().from(schema.inventoryOpsLog).all();
}

function item(db: TestDb, id: number) {
	return db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, id)).get()!;
}

describe('addInventory', () => {
	it('logs exactly one attributed add op with an after snapshot', () => {
		const db = createTestDb();
		const result = addInventory(db, { name: 'Kipfilet', section: 'freezer', qtyNum: 2, unit: 'stuks' }, CTX);

		expect(result.action).toBe('add');
		expect(result.opId).not.toBeNull();
		const log = ops(db);
		expect(log).toHaveLength(1);
		expect(log[0].opType).toBe('add');
		expect(log[0].actor).toBe('alice');
		expect(log[0].itemId).toBe(result.item.id);
		expect(log[0].beforeSnapshot).toBeNull();
		expect((log[0].afterSnapshot as { name: string }).name).toBe('Kipfilet');
	});

	it('normalizes unit aliases to the canonical set', () => {
		const db = createTestDb();
		const result = addInventory(db, { name: 'Gehakt', section: 'freezer', qtyNum: 500, unit: 'gram' }, CTX);
		expect(result.item.unit).toBe('g');
		expect(result.item.needsReview).toBe(false);
	});

	it('keeps a non-canonical unit but flags it for review', () => {
		const db = createTestDb();
		const result = addInventory(db, { name: 'Soep', section: 'freezer', qtyNum: 1, unit: 'emmer' }, CTX);
		expect(result.item.unit).toBe('emmer');
		expect(result.item.needsReview).toBe(true);
		expect(result.item.reviewReason).toContain('non_canonical_unit');
	});

	it('defaults leftovers to portion and flags non-portion leftover units', () => {
		const db = createTestDb();
		const defaulted = addInventory(
			db,
			{ name: 'Bolognese', section: 'freezer', kind: 'leftover', qtyNum: 3 },
			CTX
		);
		expect(defaulted.item.unit).toBe('portion');
		expect(defaulted.item.needsReview).toBe(false);

		const flagged = addInventory(
			db,
			{ name: 'Erwtensoep', section: 'freezer', kind: 'leftover', qtyNum: 2, unit: 'zak' },
			CTX
		);
		expect(flagged.item.needsReview).toBe(true);
		expect(flagged.item.reviewReason).toContain('leftover_non_portion_unit');
	});

	it('logs a merge as an update op with before and after snapshots', () => {
		const db = createTestDb();
		const first = addInventory(db, { name: 'Spinazie', section: 'freezer', qtyNum: 1, unit: 'zak' }, CTX);
		const second = addInventory(db, { name: 'Spinazie', section: 'freezer', qtyNum: 2, unit: 'zak' }, CTX);

		expect(second.action).toBe('update');
		const log = ops(db);
		expect(log).toHaveLength(2);
		expect(log[1].opType).toBe('update');
		expect((log[1].beforeSnapshot as { qtyNum: number }).qtyNum).toBe(1);
		expect((log[1].afterSnapshot as { qtyNum: number }).qtyNum).toBe(3);
		expect(log[1].itemId).toBe(first.item.id);
	});
});

describe('updateInventory + undo', () => {
	it('undoes an update by restoring the before snapshot as a new op', () => {
		const db = createTestDb();
		const added = addInventory(db, { name: 'Kip', section: 'freezer', qtyNum: 2, unit: 'stuk' }, CTX);
		const updated = updateInventory(db, added.item.id, { qtyNum: 5 }, CTX);
		if (!updated.ok) throw new Error('update failed');
		expect(updated.item.qtyNum).toBe(5);

		const undone = undoOp(db, updated.opId!, { actor: 'bob', userId: 1 });
		if (!undone.ok) throw new Error(`undo failed: ${undone.error}`);
		expect(undone.item.qtyNum).toBe(2);

		const log = ops(db);
		expect(log).toHaveLength(3);
		expect(log[2].undoOf).toBe(updated.opId);
		expect(log[2].actor).toBe('bob');
	});

	it('refuses to undo when the item changed since, and flags it for review', () => {
		const db = createTestDb();
		const added = addInventory(db, { name: 'Kip', section: 'freezer', qtyNum: 2, unit: 'stuk' }, CTX);
		const firstUpdate = updateInventory(db, added.item.id, { qtyNum: 5 }, CTX);
		if (!firstUpdate.ok) throw new Error('update failed');
		updateInventory(db, added.item.id, { qtyNum: 7 }, CTX);

		const undone = undoOp(db, firstUpdate.opId!, CTX);
		expect(undone.ok).toBe(false);
		if (!undone.ok) expect(undone.conflict).toBe(true);

		const current = item(db, added.item.id);
		expect(current.qtyNum).toBe(7);
		expect(current.needsReview).toBe(true);
		expect(current.reviewReason).toContain('undo_conflict');
	});

	it('treats before-less update ops as display-only (legacy rows)', () => {
		const db = createTestDb();
		const added = addInventory(db, { name: 'Kip', section: 'freezer' }, CTX);
		const legacyOp = db
			.insert(schema.inventoryOpsLog)
			.values({
				userId: 1,
				opType: 'update',
				itemId: added.item.id,
				afterSnapshot: { id: added.item.id, name: 'Kip' },
				createdAt: new Date()
			})
			.returning()
			.get();

		const undone = undoOp(db, legacyOp.id, CTX);
		expect(undone.ok).toBe(false);
		if (!undone.ok) expect(undone.error).toContain('display-only');
	});
});

describe('removeInventory + undo', () => {
	it('soft-deletes, then a compensating add op restores it', () => {
		const db = createTestDb();
		const added = addInventory(db, { name: 'IJs', section: 'freezer', qtyNum: 1, unit: 'bak' }, CTX);
		const removed = removeInventory(db, { id: added.item.id }, CTX);
		if (!removed.ok) throw new Error('remove failed');
		expect(item(db, added.item.id).deletedAt).not.toBeNull();

		const undone = undoLatestRemoveForItem(db, added.item.id, CTX);
		if (!undone.ok) throw new Error(`undo failed: ${undone.error}`);
		expect(item(db, added.item.id).deletedAt).toBeNull();

		const log = ops(db);
		expect(log.map((op) => op.opType)).toEqual(['add', 'remove', 'add']);
		expect(log[2].undoOf).toBe(removed.opId);
	});

	it('undoes an add by soft-deleting the item', () => {
		const db = createTestDb();
		const added = addInventory(db, { name: 'Pizza', section: 'freezer', qtyNum: 3, unit: 'stuk' }, CTX);
		const undone = undoOp(db, added.opId!, CTX);
		if (!undone.ok) throw new Error(`undo failed: ${undone.error}`);
		expect(item(db, added.item.id).deletedAt).not.toBeNull();
		const log = ops(db);
		expect(log[1].opType).toBe('remove');
		expect(log[1].undoOf).toBe(added.opId);
	});
});

describe('setReviewFlag', () => {
	it('flags and resolves with logged ops', () => {
		const db = createTestDb();
		const added = addInventory(db, { name: 'Mysterie', section: 'pantry' }, CTX);

		const flagged = setReviewFlag(db, added.item.id, 'manual_check', CTX);
		if (!flagged.ok) throw new Error('flag failed');
		expect(flagged.item.needsReview).toBe(true);
		expect(flagged.item.reviewReason).toBe('manual_check');

		const resolved = setReviewFlag(db, added.item.id, null, CTX);
		if (!resolved.ok) throw new Error('resolve failed');
		expect(resolved.item.needsReview).toBe(false);
		expect(resolved.item.reviewReason).toBeNull();

		expect(ops(db)).toHaveLength(3);
	});
});

describe('legacy taxonomy backfill (migration 0007)', () => {
	it('maps known legacy categories deterministically and leaves unknowns null', () => {
		// createTestDb applies all migrations to an empty DB, so re-run the
		// backfill statements against seeded legacy rows to prove idempotent
		// mapping behavior.
		const db = createTestDb();
		const now = new Date();
		db.insert(schema.inventoryItems)
			.values([
				{ name: 'Kipfilet', section: 'freezer', category: 'kip', createdAt: now, updatedAt: now },
				{ name: 'Zalm', section: 'freezer', category: 'fish', createdAt: now, updatedAt: now },
				{ name: 'Diepvriespizza', section: 'freezer', category: 'kant en klaar', createdAt: now, updatedAt: now },
				{ name: 'Raadsel', section: 'pantry', category: 'weird-stuff', createdAt: now, updatedAt: now },
				{
					name: 'Al geclassificeerd',
					section: 'pantry',
					category: 'meat',
					kind: 'processed',
					createdAt: now,
					updatedAt: now
				}
			])
			.run();

		const sql = readFileSync(path.join(process.cwd(), 'drizzle', '0007_legacy_taxonomy_backfill.sql'), 'utf-8');
		for (const statement of sql.split('--> statement-breakpoint')) {
			const cleaned = statement.replace(/^--.*$/gm, '').trim();
			if (cleaned) db.$client.exec(cleaned);
		}

		const rows = db.select().from(schema.inventoryItems).all();
		const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
		expect(byName['Kipfilet'].kind).toBe('ingredient');
		expect(byName['Kipfilet'].foodClass).toBe('chicken');
		expect(byName['Zalm'].foodClass).toBe('fish');
		expect(byName['Diepvriespizza'].kind).toBe('processed');
		expect(byName['Raadsel'].kind).toBeNull();
		expect(byName['Raadsel'].foodClass).toBeNull();
		// Idempotence guard: an already-classified row is never overwritten.
		expect(byName['Al geclassificeerd'].kind).toBe('processed');
	});
});

describe('review-reason ownership (UX-STOCK-1)', () => {
	it('converts stuk to portion silently for leftovers on add', () => {
		const db = createTestDb();
		const result = addInventory(
			db,
			{ name: 'Hachee', section: 'freezer', kind: 'leftover', qtyNum: 4, unit: 'stuks' },
			CTX
		);
		expect(result.item.unit).toBe('portion');
		expect(result.item.needsReview).toBe(false);
	});

	it('converts stuk to portion when an item is reclassified to leftover', () => {
		const db = createTestDb();
		const added = addInventory(db, { name: 'Pizza', section: 'freezer', kind: 'processed', qtyNum: 2, unit: 'stuk' }, CTX);
		const updated = updateInventory(db, added.item.id, { kind: 'leftover' }, CTX);
		if (!updated.ok) throw new Error('update failed');
		expect(updated.item.unit).toBe('portion');
		expect(updated.item.needsReview).toBe(false);
	});

	it('clears a rule-derived flag once the offending fact is fixed', () => {
		const db = createTestDb();
		const flagged = addInventory(
			db,
			{ name: 'Soep', section: 'freezer', kind: 'leftover', qtyNum: 800, unit: 'g' },
			CTX
		);
		expect(flagged.item.reviewReason).toContain('leftover_non_portion_unit');

		// The UI's "Set portions" patch: unit + integer count, no needs_review field.
		const fixed = updateInventory(db, flagged.item.id, { unit: 'portion', qtyNum: 3 }, CTX);
		if (!fixed.ok) throw new Error('update failed');
		expect(fixed.item.needsReview).toBe(false);
		expect(fixed.item.reviewReason).toBeNull();
	});

	it('keeps a live rule flag even after an explicit resolve', () => {
		const db = createTestDb();
		const flagged = addInventory(
			db,
			{ name: 'Stoof', section: 'freezer', kind: 'leftover', qtyNum: 500, unit: 'g' },
			CTX
		);
		const resolved = updateInventory(db, flagged.item.id, { needsReview: false, reviewReason: null }, CTX);
		if (!resolved.ok) throw new Error('update failed');
		expect(resolved.item.needsReview).toBe(true);
		expect(resolved.item.reviewReason).toContain('leftover_non_portion_unit');
	});

	it('preserves sticky reasons across unrelated updates and clears them on resolve', () => {
		const db = createTestDb();
		const added = addInventory(db, { name: 'Kip', section: 'freezer', qtyNum: 2, unit: 'stuk' }, CTX);
		setReviewFlag(db, added.item.id, 'manual_check', CTX);

		const touched = updateInventory(db, added.item.id, { qtyNum: 5 }, CTX);
		if (!touched.ok) throw new Error('update failed');
		expect(touched.item.needsReview).toBe(true);
		expect(touched.item.reviewReason).toContain('manual_check');

		const resolved = updateInventory(db, added.item.id, { needsReview: false, reviewReason: null }, CTX);
		if (!resolved.ok) throw new Error('update failed');
		expect(resolved.item.needsReview).toBe(false);
		expect(resolved.item.reviewReason).toBeNull();
	});
});

describe('keep-stocked auto-staple (UX-STOCK-14)', () => {
	function seedRecipe(db: TestDb, overrides: Record<string, unknown> = {}) {
		return db
			.insert(schema.recipes)
			.values({
				slug: 'hachee',
				title: 'Hachee',
				servings: 4,
				ingredients: [],
				directions: [],
				createdAt: new Date(),
				updatedAt: new Date(),
				...overrides
			})
			.returning()
			.get()!;
	}

	function recipeById(db: TestDb, id: number) {
		return db.select().from(schema.recipes).where(eq(schema.recipes.id, id)).get()!;
	}

	it('marks the recipe as freezer staple when a leftover links to it', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		addInventory(
			db,
			{ name: 'Hachee', section: 'freezer', kind: 'leftover', qtyNum: 6, unit: 'portion', madeFromRecipeId: recipe.id },
			CTX
		);
		const after = recipeById(db, recipe.id);
		expect(after.isFreezerStaple).toBe(true);
		// Default target = max(frozen portions on hand, servings).
		expect(after.targetPortions).toBe(6);
	});

	it('respects the opt-out: an opted-out recipe is never re-stapled by a freeze', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db, { freezerStapleOptOut: true });
		addInventory(
			db,
			{ name: 'Hachee', section: 'freezer', kind: 'leftover', qtyNum: 4, unit: 'portion', madeFromRecipeId: recipe.id },
			CTX
		);
		const after = recipeById(db, recipe.id);
		expect(after.isFreezerStaple).toBe(false);
		expect(after.targetPortions).toBeNull();
	});

	it('never overwrites a user-set target', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db, { isFreezerStaple: true, targetPortions: 2 });
		addInventory(
			db,
			{ name: 'Hachee', section: 'freezer', kind: 'leftover', qtyNum: 6, unit: 'portion', madeFromRecipeId: recipe.id },
			CTX
		);
		expect(recipeById(db, recipe.id).targetPortions).toBe(2);
	});

	it('auto-staples when an existing item is linked via update', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		const added = addInventory(db, { name: 'Hachee', section: 'freezer', kind: 'leftover', qtyNum: 3 }, CTX);
		updateInventory(db, added.item.id, { madeFromRecipeId: recipe.id, recipeStatus: 'linked' }, CTX);
		const after = recipeById(db, recipe.id);
		expect(after.isFreezerStaple).toBe(true);
		expect(after.targetPortions).toBe(4); // max(onHand 3, servings 4)
	});

	it('setFreezerStaple records the opt-out on off and clears it on on', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		setFreezerStaple(db, recipe.id, true, 4);
		let after = recipeById(db, recipe.id);
		expect(after.isFreezerStaple).toBe(true);
		expect(after.freezerStapleOptOut).toBe(false);
		expect(after.targetPortions).toBe(4);

		setFreezerStaple(db, recipe.id, false);
		after = recipeById(db, recipe.id);
		expect(after.isFreezerStaple).toBe(false);
		expect(after.freezerStapleOptOut).toBe(true);
		expect(after.targetPortions).toBeNull();

		// The opt-out now blocks the next freeze from silently re-enabling.
		addInventory(
			db,
			{ name: 'Hachee', section: 'freezer', kind: 'leftover', qtyNum: 5, unit: 'portion', madeFromRecipeId: recipe.id },
			CTX
		);
		expect(recipeById(db, recipe.id).isFreezerStaple).toBe(false);
	});
});
