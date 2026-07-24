import { describe, expect, it } from 'vitest';
import {
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
});
