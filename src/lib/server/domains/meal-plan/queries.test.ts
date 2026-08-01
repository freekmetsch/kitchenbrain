import { describe, expect, it } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import {
	listRecipeMealOccurrences,
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

	it('keeps duplicate current and future recipe occurrences distinct and ordered', () => {
		const db = createTestDb();
		const now = new Date('2026-07-27T10:00:00Z');
		const meals = db
			.insert(schema.mealPlanMeals)
			.values([
				{
					weekNumber: 30,
					weekStartDate: '2026-07-22',
					dinner: 'Past stew',
					recipeSlug: 'stew',
					createdAt: now
				},
				{
					weekNumber: 31,
					weekStartDate: '2026-07-29',
					plannedDate: '2026-07-31',
					dinner: 'Friday stew',
					recipeSlug: 'stew',
					createdAt: now
				},
				{
					weekNumber: 31,
					weekStartDate: '2026-07-29',
					plannedDate: '2026-07-30',
					dinner: 'Thursday stew',
					recipeSlug: 'stew',
					createdAt: now
				},
				{
					weekNumber: 31,
					weekStartDate: '2026-07-29',
					dinner: 'Other recipe',
					recipeSlug: 'soup',
					createdAt: now
				}
			])
			.returning()
			.all();

		expect(listRecipeMealOccurrences(db, 'stew', '2026-07-29').map((meal) => meal.id)).toEqual([
			meals[2].id,
			meals[1].id
		]);
	});
});
