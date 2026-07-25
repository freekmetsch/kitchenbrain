import { describe, expect, it } from 'vitest';
import {
	adjacentMealPlanWeeks,
	mealPlanWeekHref,
	selectedMealPlanWeek
} from './meal_plan_navigation';

const weeks = [
	{ weekStartDate: '2026-07-15', label: 'past' },
	{ weekStartDate: '2026-07-22', label: 'current' },
	{ weekStartDate: '2026-07-29', label: 'next' }
];

describe('selectedMealPlanWeek', () => {
	it('prefers an explicit focused week and otherwise selects the current week', () => {
		expect(selectedMealPlanWeek(weeks, '2026-07-29', '2026-07-22')?.label).toBe('next');
		expect(selectedMealPlanWeek(weeks, null, '2026-07-22')?.label).toBe('current');
	});

	it('falls back to the current or first available week when focus is stale', () => {
		expect(selectedMealPlanWeek(weeks, '2027-01-01', '2026-07-22')?.label).toBe('current');
		expect(selectedMealPlanWeek(weeks, null, '2027-01-01')?.label).toBe('past');
		expect(selectedMealPlanWeek([], null, '2026-07-22')).toBeUndefined();
	});
});

describe('adjacentMealPlanWeeks', () => {
	it('returns bounded previous and next neighbors', () => {
		expect(adjacentMealPlanWeeks(weeks, '2026-07-22')).toEqual({
			previous: weeks[0],
			next: weeks[2]
		});
		expect(adjacentMealPlanWeeks(weeks, '2026-07-15')).toEqual({
			previous: null,
			next: weeks[1]
		});
		expect(adjacentMealPlanWeeks(weeks, '2026-07-29')).toEqual({
			previous: weeks[1],
			next: null
		});
	});

	it('disables both directions when the selected week is absent', () => {
		expect(adjacentMealPlanWeeks(weeks, '2027-01-01')).toEqual({
			previous: null,
			next: null
		});
	});
});

describe('mealPlanWeekHref', () => {
	it('keeps week selection in the URL and preserves expanded past history', () => {
		expect(mealPlanWeekHref('', '2026-07-29', false)).toBe(
			'/meal-plan?week=2026-07-29'
		);
		expect(mealPlanWeekHref('/kitchen', '2026-07-15', true)).toBe(
			'/kitchen/meal-plan?week=2026-07-15&past=1'
		);
	});
});
