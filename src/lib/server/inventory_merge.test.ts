import { describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { normalizeNameKey } from '$lib/match';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from './test_db';
import { findOrMergeInventory } from './inventory_merge';

function allItems(db: ReturnType<typeof createTestDb>) {
	return db.select().from(schema.inventoryItems).all();
}

function activeItems(db: ReturnType<typeof createTestDb>) {
	return db.select().from(schema.inventoryItems).where(isNull(schema.inventoryItems.deletedAt)).all();
}

function seedItem(
	db: ReturnType<typeof createTestDb>,
	values: Partial<typeof schema.inventoryItems.$inferInsert> &
		Pick<typeof schema.inventoryItems.$inferInsert, 'name' | 'section'>
) {
	const now = new Date();
	return db
		.insert(schema.inventoryItems)
		.values({
			qtyText: null,
			qtyNum: null,
			unit: null,
			category: null,
			expiryDate: null,
			tags: [],
			createdAt: now,
			updatedAt: now,
			...values
		})
		.returning()
		.get();
}

describe('normalizeNameKey', () => {
	it('strips stop words and diacritics for stable matching', () => {
		expect(normalizeNameKey('Biologische crème fraîche')).toBe('creme fraiche');
		expect(normalizeNameKey('Rode tomaten')).toBe('rode tomat');
		expect(normalizeNameKey('Oude kaas')).not.toBe(normalizeNameKey('Jonge kaas'));
	});
});

describe('findOrMergeInventory', () => {
	it('applies staple state when the matching pantry item already exists', () => {
		const db = createTestDb();
		seedItem(db, { name: 'Olijfolie', section: 'pantry', kind: 'ingredient', isStaple: false });

		const result = findOrMergeInventory(db, {
			name: 'olijfolie',
			section: 'pantry',
			kind: 'ingredient',
			isStaple: true
		});

		expect(result.action).toBe('update');
		expect(result.item.isStaple).toBe(true);
	});

	it('merges an exact duplicate by summing aligned numeric quantities', () => {
		const db = createTestDb();
		const first = findOrMergeInventory(db, {
			name: 'Bladerdeeg',
			section: 'freezer',
			qtyNum: 2,
			unit: 'stuks',
			tags: ['veg']
		});
		const second = findOrMergeInventory(db, {
			name: 'Bladerdeeg',
			section: 'freezer',
			qtyNum: 3,
			unit: 'stuks',
			tags: ['kids']
		});

		expect(first.action).toBe('add');
		expect(first.before).toBeNull();
		expect(second.action).toBe('update');
		expect(second.before?.qtyNum).toBe(2);
		expect(allItems(db)).toHaveLength(1);
		expect(second.item.qtyNum).toBe(5);
		expect(second.item.qtyText).toBe('5 stuks');
		expect(second.item.tags).toEqual(['veg', 'kids']);
	});

	it('does not merge an ingredient with a leftover of the same name', () => {
		const db = createTestDb();
		seedItem(db, { name: 'Curry', section: 'freezer', kind: 'ingredient' });

		const result = findOrMergeInventory(db, {
			name: 'Curry',
			section: 'freezer',
			kind: 'leftover',
			qtyNum: 2,
			unit: 'portion'
		});

		expect(result.action).toBe('add');
		expect(activeItems(db)).toHaveLength(2);
	});

	it('does not merge leftovers of two different recipes with the same name', () => {
		const db = createTestDb();
		const now = new Date();
		const [recipeA, recipeB] = db
			.insert(schema.recipes)
			.values([
				{ slug: 'curry-a', title: 'Curry A', ingredients: [], directions: [], createdAt: now, updatedAt: now },
				{ slug: 'curry-b', title: 'Curry B', ingredients: [], directions: [], createdAt: now, updatedAt: now }
			])
			.returning()
			.all();
		seedItem(db, {
			name: 'Curry',
			section: 'freezer',
			kind: 'leftover',
			madeFromRecipeId: recipeA.id,
			qtyNum: 2,
			unit: 'portion'
		});

		const result = findOrMergeInventory(db, {
			name: 'Curry',
			section: 'freezer',
			kind: 'leftover',
			madeFromRecipeId: recipeB.id,
			qtyNum: 1,
			unit: 'portion'
		});

		expect(result.action).toBe('add');
		expect(activeItems(db)).toHaveLength(2);
	});

	it('merges unlinked leftovers of the same name and sums portions', () => {
		const db = createTestDb();
		seedItem(db, {
			name: 'Bolognese',
			section: 'freezer',
			kind: 'leftover',
			qtyNum: 2,
			unit: 'portion'
		});

		const result = findOrMergeInventory(db, {
			name: 'Bolognese',
			section: 'freezer',
			kind: 'leftover',
			qtyNum: 1,
			unit: 'portion'
		});

		expect(result.action).toBe('update');
		expect(result.item.qtyNum).toBe(3);
		expect(activeItems(db)).toHaveLength(1);
	});

	it('adopts the incoming kind on a legacy null-kind merge and flags review', () => {
		const db = createTestDb();
		seedItem(db, { name: 'Spinazie', section: 'freezer', qtyNum: 1, unit: 'zak' });

		const result = findOrMergeInventory(db, {
			name: 'Spinazie',
			section: 'freezer',
			kind: 'ingredient',
			qtyNum: 1,
			unit: 'zak'
		});

		expect(result.action).toBe('update');
		expect(result.item.kind).toBe('ingredient');
		expect(result.item.needsReview).toBe(true);
		expect(result.item.reviewReason).toBe('kind_adopted_on_merge');
		expect(result.warnings).toContain('kind_adopted_on_merge');
	});

	it('merges a qualified duplicate', () => {
		const db = createTestDb();
		seedItem(db, { name: 'bladerdeeg', section: 'freezer', qtyNum: 1, unit: 'pak' });

		const result = findOrMergeInventory(db, {
			name: 'roomboter bladerdeeg',
			section: 'freezer',
			qtyNum: 1,
			unit: 'pak'
		});

		expect(result.action).toBe('update');
		expect(result.matchedBy).toBe('qualified-name');
		expect(activeItems(db)).toHaveLength(1);
		expect(result.item.qtyNum).toBe(2);
	});

	it('keeps the oldest known entry date when merging stock', () => {
		const db = createTestDb();
		const oldEntry = new Date('2026-01-15T00:00:00.000Z');
		const newerEntry = new Date('2026-06-01T00:00:00.000Z');
		seedItem(db, { name: 'Spinazie', section: 'freezer', createdAt: newerEntry });

		const result = findOrMergeInventory(db, {
			name: 'spinazie',
			section: 'freezer',
			qtyNum: 1,
			unit: 'zak',
			createdAt: oldEntry
		});

		expect(result.action).toBe('update');
		expect(result.item.createdAt.toISOString()).toBe(oldEntry.toISOString());
	});

	it('does not merge product-shape changes that only share a base token', () => {
		const db = createTestDb();
		seedItem(db, { name: 'Tomaten', section: 'freezer', qtyNum: 1, unit: 'zak' });

		const result = findOrMergeInventory(db, {
			name: 'Tomatensaus',
			section: 'freezer',
			qtyNum: 1,
			unit: 'pak'
		});

		expect(result.action).toBe('add');
		expect(activeItems(db)).toHaveLength(2);
	});

	it('does not merge contrastive product descriptors', () => {
		const db = createTestDb();
		seedItem(db, { name: 'Jonge kaas', section: 'pantry', qtyNum: 1, unit: 'pak' });

		const result = findOrMergeInventory(db, {
			name: 'Oude kaas',
			section: 'pantry',
			qtyNum: 1,
			unit: 'pak'
		});

		expect(result.action).toBe('add');
		expect(activeItems(db)).toHaveLength(2);
	});

	it('keeps mismatched units readable instead of summing them', () => {
		const db = createTestDb();
		seedItem(db, { name: 'Gehakt', section: 'freezer', qtyText: '2 pak', qtyNum: 2, unit: 'pak' });

		const result = findOrMergeInventory(db, {
			name: 'gehakt',
			section: 'freezer',
			qtyText: '500 g',
			qtyNum: 500,
			unit: 'g'
		});

		expect(result.action).toBe('update');
		expect(result.warnings).toContain('unit_mismatch_quantity_not_summed');
		expect(result.item.qtyNum).toBeNull();
		expect(result.item.unit).toBeNull();
		expect(result.item.qtyText).toBe('2 pak + 500 g');
	});

	it('inserts when no existing item matches', () => {
		const db = createTestDb();
		seedItem(db, { name: 'Spinazie', section: 'freezer' });

		const result = findOrMergeInventory(db, { name: 'IJs', section: 'freezer' });

		expect(result.action).toBe('add');
		expect(activeItems(db)).toHaveLength(2);
	});

	it('ignores soft-deleted matches', () => {
		const db = createTestDb();
		seedItem(db, { name: 'Erwten', section: 'freezer', deletedAt: new Date() });

		const result = findOrMergeInventory(db, { name: 'Erwten', section: 'freezer' });

		expect(result.action).toBe('add');
		expect(allItems(db)).toHaveLength(2);
		expect(
			db
				.select()
				.from(schema.inventoryItems)
				.where(and(eq(schema.inventoryItems.name, 'Erwten'), isNull(schema.inventoryItems.deletedAt)))
				.all()
		).toHaveLength(1);
	});
});
