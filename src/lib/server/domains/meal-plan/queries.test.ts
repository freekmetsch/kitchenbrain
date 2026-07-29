import { describe, expect, it } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import {
	listMissedPlannedMeals,
	listMealsForWeekInSourceOrder,
	listMealsForWeekUnordered
} from './queries';

describe('meal-plan queries', () => {
	it('loads a planning week with stable source ordering when requested', () => {
		const db = createTestDb();
		const now = new Date('2026-07-27T10:00:00Z');
		const meals = db
			.insert(schema.mealPlanMeals)
			.values([
				{
					weekNumber: 31,
					weekStartDate: '2026-07-29',
					dinner: 'Second',
					sortOrder: 1,
					createdAt: now
				},
				{
					weekNumber: 31,
					weekStartDate: '2026-07-29',
					dinner: 'First',
					sortOrder: 0,
					createdAt: now
				},
				{
					weekNumber: 31,
					weekStartDate: '2026-07-29',
					dinner: 'Also first',
					sortOrder: 0,
					createdAt: now
				},
				{
					weekNumber: 32,
					weekStartDate: '2026-08-05',
					dinner: 'Next week',
					sortOrder: 0,
					createdAt: now
				}
			])
			.returning()
			.all();

		expect(listMealsForWeekUnordered(db, '2026-07-29')).toHaveLength(3);
		expect(
			listMealsForWeekInSourceOrder(db, '2026-07-29').map((meal) => meal.id)
		).toEqual([meals[1].id, meals[2].id, meals[0].id]);
	});

	it('returns only uncooked past meals and treats an old undated week as missed', () => {
		const db = createTestDb();
		const now = new Date('2026-07-29T10:00:00Z');
		db.insert(schema.mealPlanMeals)
			.values([
				{
					weekNumber: 30,
					weekStartDate: '2026-07-22',
					dinner: 'Old undated dinner',
					status: 'planned',
					createdAt: now
				},
				{
					weekNumber: 31,
					weekStartDate: '2026-07-29',
					dinner: 'Past dated dinner',
					plannedDate: '2026-07-28',
					status: 'planned',
					createdAt: now
				},
				{
					weekNumber: 31,
					weekStartDate: '2026-07-29',
					dinner: 'Tonight',
					plannedDate: '2026-07-29',
					status: 'planned',
					createdAt: now
				},
				{
					weekNumber: 30,
					weekStartDate: '2026-07-22',
					dinner: 'Already cooked',
					plannedDate: '2026-07-23',
					status: 'cooked',
					createdAt: now
				}
			])
			.run();

		expect(
			listMissedPlannedMeals(db, {
				today: '2026-07-29',
				currentWeekStart: '2026-07-29'
			}).map((meal) => meal.dinner)
		).toEqual(['Old undated dinner', 'Past dated dinner']);
	});
});
