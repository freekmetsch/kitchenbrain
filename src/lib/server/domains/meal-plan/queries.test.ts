import { describe, expect, it } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import {
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
});
