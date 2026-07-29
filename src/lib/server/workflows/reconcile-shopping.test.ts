import { describe, expect, it } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import {
	isShoppingWeekEditable,
	reconcileShoppingAfterWrite,
	resolveShoppingWeek
} from './reconcile-shopping';

describe('shopping week selection', () => {
	it('keeps an explicit week query authoritative', () => {
		expect(
			resolveShoppingWeek({
				requestedWeek: '2026-07-08',
				today: '2026-07-28',
				weekStartDay: 2,
				groceryDay: 1
			})
		).toBe('2026-07-08');
	});

	it('uses the planning week containing today when no grocery day is configured', () => {
		expect(
			resolveShoppingWeek({
				requestedWeek: null,
				today: '2026-07-28',
				weekStartDay: 2,
				groceryDay: null
			})
		).toBe('2026-07-22');
	});

	it('selects the planning week whose delivery is today', () => {
		expect(
			resolveShoppingWeek({
				requestedWeek: null,
				today: '2026-07-28',
				weekStartDay: 2,
				groceryDay: 1
			})
		).toBe('2026-07-29');
	});

	it('keeps the current planning week until its delivery date has passed', () => {
		const input = { requestedWeek: null, weekStartDay: 2, groceryDay: 4 };
		expect(resolveShoppingWeek({ ...input, today: '2026-07-24' })).toBe('2026-07-22');
		expect(resolveShoppingWeek({ ...input, today: '2026-07-25' })).toBe('2026-07-29');
	});

	it('advances cleanly across a year boundary', () => {
		expect(
			resolveShoppingWeek({
				requestedWeek: null,
				today: '2026-12-30',
				weekStartDay: 2,
				groceryDay: 1
			})
		).toBe('2027-01-06');
	});

	it('keeps current and future weeks editable and captured past weeks read-only', () => {
		const input = { today: '2026-07-29', weekStartDay: 2 };
		expect(isShoppingWeekEditable({ ...input, weekStart: '2026-07-22' })).toBe(false);
		expect(isShoppingWeekEditable({ ...input, weekStart: '2026-07-29' })).toBe(true);
		expect(isShoppingWeekEditable({ ...input, weekStart: '2026-08-05' })).toBe(true);
	});
});

describe('shopping reconciliation workflow', () => {
	it('participates in its caller transaction without committing a nested transaction', () => {
		const db = createTestDb();
		const now = new Date();
		db.insert(schema.householdPrefs)
			.values({ key: 'shopping.source_entries.v1', value: 'complete', updatedAt: now })
			.run();
		const recipe = db
			.insert(schema.recipes)
			.values({
				slug: 'rollback-curry',
				title: 'Rollback curry',
				ingredients: [{ id: 'rice', name: 'rijst', amount: '200', unit: 'g' }],
				directions: [],
				createdAt: now,
				updatedAt: now
			})
			.returning()
			.get();

		expect(() =>
			db.transaction((tx) => {
				tx.insert(schema.mealPlanMeals)
					.values({
						weekNumber: 30,
						weekStartDate: '2026-07-22',
						dinner: 'Rollback curry',
						recipeSlug: recipe.slug,
						sortOrder: 0,
						createdAt: now
					})
					.run();
				reconcileShoppingAfterWrite(tx, ['2026-07-22'], {
					today: '2026-07-22'
				});
				throw new Error('rollback');
			})
		).toThrow('rollback');

		expect(db.select().from(schema.mealPlanMeals).all()).toEqual([]);
		expect(db.select().from(schema.shoppingWeekEntries).all()).toEqual([]);
	});
});
