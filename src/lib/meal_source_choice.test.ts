import { describe, expect, it } from 'vitest';
import {
	allocateFrozenPortions,
	defaultServingsForMealSource,
	frozenPortionShortfall,
	isMealSourceAvailable
} from './meal_source_choice';

describe('defaultServingsForMealSource', () => {
	it('keeps the visible fresh and freezer portion choices honest', () => {
		expect(defaultServingsForMealSource('fresh', 16, 6)).toBe(16);
		expect(defaultServingsForMealSource('freezer', 16, 6)).toBe(6);
		expect(defaultServingsForMealSource('fresh', null, 6)).toBeNull();
		expect(defaultServingsForMealSource('freezer', null, 6)).toBe(6);
	});

	it('does not offer the freezer source without stock', () => {
		expect(isMealSourceAvailable('fresh', 0)).toBe(true);
		expect(isMealSourceAvailable('freezer', 0)).toBe(false);
		expect(isMealSourceAvailable('freezer', 1)).toBe(true);
	});

	it('shows only the requested portions beyond freezer stock as a shortfall', () => {
		expect(frozenPortionShortfall(4, 6)).toBe(0);
		expect(frozenPortionShortfall(8, 6)).toBe(2);
	});

	it('allocates shared freezer stock once across meals for the same recipe', () => {
		const sharedRecipeMeals = [
			{ recipeSlug: 'soup', servings: 3, frozenPortions: 4, source: 'freezer' as const },
			{ recipeSlug: 'soup', servings: 3, frozenPortions: 4, source: 'freezer' as const },
			{ recipeSlug: 'soup', servings: 4, frozenPortions: 4, source: 'fresh' as const }
		];

		expect(allocateFrozenPortions(sharedRecipeMeals)).toEqual([3, 1, 0]);
		expect(
			allocateFrozenPortions([
				{ ...sharedRecipeMeals[0], servings: 1 },
				sharedRecipeMeals[1],
				sharedRecipeMeals[2]
			])
		).toEqual([1, 3, 0]);
	});
});
