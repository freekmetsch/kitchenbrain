import { describe, expect, it } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import {
	getActiveShoppingEntryBySource,
	listAhFavorites,
	listRecentShoppingPushes,
	getShoppingWeekEntry,
	getShoppingWeekView
} from './queries';

const WEEK = '2026-07-22';

describe('shopping week projection', () => {
	it('reads a shopping source by id and resolves only its active occurrence', () => {
		const db = createTestDb();
		const now = new Date();
		const [active, retired] = db
			.insert(schema.shoppingWeekEntries)
			.values([
				{
					weekStartDate: WEEK,
					sourceKey: 'recipe:1:rice',
					sourceKind: 'recipe',
					name: 'rijst',
					approvedTerms: ['rijst'],
					createdAt: now,
					updatedAt: now
				},
				{
					weekStartDate: '2026-07-29',
					sourceKey: 'recipe:1:rice',
					sourceKind: 'recipe',
					name: 'rijst',
					approvedTerms: ['rijst'],
					retiredAt: now,
					createdAt: now,
					updatedAt: now
				}
			])
			.returning()
			.all();

		expect(getShoppingWeekEntry(db, retired.id)).toEqual(retired);
		expect(
			getActiveShoppingEntryBySource(db, active.weekStartDate, active.sourceKey)
		).toEqual(active);
		expect(
			getActiveShoppingEntryBySource(db, retired.weekStartDate, retired.sourceKey)
		).toBeUndefined();
	});

	it('loads AH favorites and recent pushes with their item rows', () => {
		const db = createTestDb();
		const now = new Date('2026-07-27T10:00:00Z');
		db.insert(schema.ahFavorites)
			.values({
				nameKey: 'tomaten',
				productId: '123',
				productName: 'AH Tomaten',
				createdAt: now
			})
			.run();
		const userId = db.select().from(schema.users).get()!.id;
		const pushes = db
			.insert(schema.shoppingPushHistory)
			.values([
				{
					weekStartDate: WEEK,
					userId,
					destination: 'list',
					attemptStatus: 'succeeded',
					createdAt: now
				},
				{
					weekStartDate: '2026-07-29',
					userId,
					destination: 'list',
					attemptStatus: 'failed',
					createdAt: new Date(now.getTime() + 1)
				}
			])
			.returning()
			.all();
		db.insert(schema.shoppingPushItems)
			.values({
				pushId: pushes[0].id,
				sourceRef: '1',
				sourceName: 'tomaten',
				mode: 'freetext',
				destination: 'list',
				status: 'success',
				createdAt: now
			})
			.run();

		expect(listAhFavorites(db)).toHaveLength(1);
		expect(listRecentShoppingPushes(db, WEEK, 5)).toEqual([
			expect.objectContaining({
				id: pushes[0].id,
				items: [expect.objectContaining({ sourceName: 'tomaten' })]
			})
		]);
	});

	it('sums compatible Dutch terms after source choices and keeps source ids', () => {
		const db = createTestDb();
		const now = new Date();
		db.insert(schema.shoppingWeekEntries).values([
			{ weekStartDate: WEEK, sourceKey: 'recipe:1:a', sourceKind: 'recipe', name: 'boter', amount: '250', unit: 'g', selectedName: 'roomboter', approvedTerms: ['boter', 'roomboter'], mealIds: [], createdAt: now, updatedAt: now },
			{ weekStartDate: WEEK, sourceKey: 'recipe:2:b', sourceKind: 'recipe', name: 'roomboter', amount: '250', unit: 'g', approvedTerms: ['roomboter'], mealIds: [], createdAt: now, updatedAt: now }
		]).run();

		const view = getShoppingWeekView(db, WEEK);
		expect(view.toBuy).toHaveLength(1);
		expect(view.toBuy[0]).toMatchObject({ name: 'roomboter', amount: '500', unit: 'g' });
		expect(view.toBuy[0].entryIds).toHaveLength(2);
	});

	it('keeps one Dutch-term row with every incompatible quantity source and excludes unresolved legacy rows', () => {
		const db = createTestDb();
		const now = new Date();
		db.insert(schema.shoppingWeekEntries).values([
			{ weekStartDate: WEEK, sourceKey: 'manual:1', sourceKind: 'manual', name: 'tomaten', amount: '2', unit: 'stuks', approvedTerms: ['tomaten'], mealIds: [], createdAt: now, updatedAt: now },
			{ weekStartDate: WEEK, sourceKey: 'manual:2', sourceKind: 'manual', name: 'tomaten', amount: '1', unit: 'blik', approvedTerms: ['tomaten'], mealIds: [], createdAt: now, updatedAt: now },
			{ weekStartDate: WEEK, sourceKey: 'legacy:3', sourceKind: 'legacy', name: 'tomaten', approvedTerms: [], mealIds: [], needsReview: true, createdAt: now, updatedAt: now }
		]).run();

		const view = getShoppingWeekView(db, WEEK);
		expect(view.toBuy).toHaveLength(1);
		expect(view.toBuy[0]).toMatchObject({
			name: 'tomaten',
			amount: null,
			unit: null,
			incompatibleQuantities: true
		});
		expect(view.toBuy[0].entryIds).toEqual(view.toBuy[0].sources.map((source) => source.id));
		expect(view.toBuy[0].entryIds).toHaveLength(2);
		expect(view.toBuy[0].sources.map(({ term, amount, unit }) => ({ term, amount, unit }))).toEqual([
			{ term: 'tomaten', amount: '2', unit: 'stuks' },
			{ term: 'tomaten', amount: '1', unit: 'blik' }
		]);
		expect(view.legacy).toHaveLength(1);
	});

	it('marks a merged row bought only when every contributing source is bought', () => {
		const db = createTestDb();
		const now = new Date();
		db.insert(schema.shoppingWeekEntries).values([
			{ weekStartDate: WEEK, sourceKey: 'manual:1', sourceKind: 'manual', name: 'melk', amount: '1', unit: 'l', approvedTerms: ['melk'], mealIds: [], bought: true, createdAt: now, updatedAt: now },
			{ weekStartDate: WEEK, sourceKey: 'weekly:2', sourceKind: 'weekly', name: 'melk', amount: '1', unit: 'l', approvedTerms: ['melk'], mealIds: [], bought: false, createdAt: now, updatedAt: now }
		]).run();

		const view = getShoppingWeekView(db, WEEK);
		expect(view.toBuy).toHaveLength(1);
		expect(view.done).toHaveLength(0);
		expect(view.toBuy[0]).toMatchObject({ amount: '2', unit: 'l', bought: false });
	});

	it('matches stock after removing descriptors but not by compound substring', () => {
		const db = createTestDb();
		const now = new Date();
		db.insert(schema.shoppingWeekEntries).values([
			{ weekStartDate: WEEK, sourceKey: 'manual:1', sourceKind: 'manual', name: 'rode ui', approvedTerms: ['rode ui'], mealIds: [], createdAt: now, updatedAt: now },
			{ weekStartDate: WEEK, sourceKey: 'manual:2', sourceKind: 'manual', name: 'rijst', approvedTerms: ['rijst'], mealIds: [], createdAt: now, updatedAt: now }
		]).run();
		db.insert(schema.inventoryItems).values([
			{ name: 'ui', section: 'pantry', createdAt: now, updatedAt: now },
			{ name: 'rijstazijn', section: 'pantry', createdAt: now, updatedAt: now }
		]).run();

		const view = getShoppingWeekView(db, WEEK);
		expect(view.toBuy.find((row) => row.name === 'rode ui')?.covered).toBe(true);
		expect(view.toBuy.find((row) => row.name === 'rijst')?.covered).toBe(false);
	});
});
