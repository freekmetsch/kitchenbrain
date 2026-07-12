import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb, type TestDb } from './test_db';
import { runTaxonomyGuardianSweep } from './inventory_guardian';
import { setReviewFlag } from './inventory_writes';

const now = new Date();

// Seed rows directly (test-only; the boundary guard skips *.test.ts) so we can
// construct unclassified states that the write-time inference would otherwise
// fill on the way in.
function seedItem(
	db: TestDb,
	values: Partial<typeof schema.inventoryItems.$inferInsert> & { name: string }
) {
	return db
		.insert(schema.inventoryItems)
		.values({ section: 'freezer', createdAt: now, updatedAt: now, ...values })
		.returning()
		.get();
}

function seedRecipe(db: TestDb) {
	return db
		.insert(schema.recipes)
		.values({ slug: 'kip-curry', title: 'Kip curry', createdAt: now, updatedAt: now })
		.returning()
		.get();
}

function fresh(db: TestDb, id: number) {
	return db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, id)).get()!;
}

function opCount(db: TestDb) {
	return db.select().from(schema.inventoryOpsLog).all().length;
}

describe('runTaxonomyGuardianSweep', () => {
	it('fills an inferable food class but flags the item while kind stays unknown', () => {
		const db = createTestDb();
		const item = seedItem(db, { name: 'Kipfilet' }); // kind null, foodClass null

		const result = runTaxonomyGuardianSweep(db);

		expect(result).toEqual({ classified: 1, flagged: 1 });
		const after = fresh(db, item.id);
		expect(after.foodClass).toBe('chicken'); // name inference filled the class
		expect(after.kind).toBeNull(); // kind is never guessed for plain items
		expect(after.needsReview).toBe(true);
		expect(after.reviewReason).toBe('unclassified');
	});

	it('classifies recipe-linked items as leftover (with portion unit) and does not flag them', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		const item = seedItem(db, { name: 'Kip curry bakje', madeFromRecipeId: recipe.id });

		const result = runTaxonomyGuardianSweep(db);

		expect(result).toEqual({ classified: 1, flagged: 0 });
		const after = fresh(db, item.id);
		expect(after.kind).toBe('leftover');
		expect(after.foodClass).toBe('chicken');
		expect(after.unit).toBe('portion'); // leftover unit default applies to the inferred kind
		expect(after.needsReview).toBe(false);
	});

	it('classifies an ingredient whose food class infers, without flagging', () => {
		const db = createTestDb();
		const item = seedItem(db, { name: 'Rundergehakt', kind: 'ingredient' });

		const result = runTaxonomyGuardianSweep(db);

		expect(result).toEqual({ classified: 1, flagged: 0 });
		const after = fresh(db, item.id);
		expect(after.kind).toBe('ingredient');
		expect(after.foodClass).toBe('beef');
		expect(after.needsReview).toBe(false);
	});

	it('flags uninferable items once and stays idempotent across sweeps', () => {
		const db = createTestDb();
		const item = seedItem(db, { name: 'Raadsel', kind: 'ingredient' }); // nothing inferable

		const first = runTaxonomyGuardianSweep(db);
		expect(first).toEqual({ classified: 0, flagged: 1 });
		expect(fresh(db, item.id).needsReview).toBe(true);
		expect(fresh(db, item.id).reviewReason).toBe('unclassified');

		const opsAfterFirst = opCount(db);
		const second = runTaxonomyGuardianSweep(db);
		expect(second).toEqual({ classified: 0, flagged: 0 });
		expect(opCount(db)).toBe(opsAfterFirst); // no churn on an already-flagged item
	});

	it('re-flags an item that was review-resolved but left unclassified', () => {
		const db = createTestDb();
		const item = seedItem(db, { name: 'Raadsel', kind: 'ingredient' });
		runTaxonomyGuardianSweep(db);

		// User resolves the review flag without classifying the item.
		const resolved = setReviewFlag(db, item.id, null, { actor: 'alice', userId: 1 });
		if (!resolved.ok) throw new Error('resolve failed');
		expect(fresh(db, item.id).needsReview).toBe(false);

		const result = runTaxonomyGuardianSweep(db);
		expect(result).toEqual({ classified: 0, flagged: 1 });
		expect(fresh(db, item.id).needsReview).toBe(true);
		expect(fresh(db, item.id).reviewReason).toBe('unclassified');
	});

	it('never double-flags an item that already needs review for another reason', () => {
		const db = createTestDb();
		const item = seedItem(db, {
			name: 'Mysterie',
			needsReview: true,
			reviewReason: 'manual_check'
		});

		const result = runTaxonomyGuardianSweep(db);

		expect(result).toEqual({ classified: 0, flagged: 0 });
		const after = fresh(db, item.id);
		expect(after.needsReview).toBe(true);
		expect(after.reviewReason).toBe('manual_check'); // reason untouched
		expect(opCount(db)).toBe(0);
	});

	it('leaves classified and deleted items untouched', () => {
		const db = createTestDb();
		seedItem(db, { name: 'Diepvriespizza', kind: 'processed' }); // processed needs no food class
		seedItem(db, { name: 'Kipfilet oud', deletedAt: now }); // deleted, even though inferable

		const result = runTaxonomyGuardianSweep(db);

		expect(result).toEqual({ classified: 0, flagged: 0 });
		expect(opCount(db)).toBe(0);
	});
});
