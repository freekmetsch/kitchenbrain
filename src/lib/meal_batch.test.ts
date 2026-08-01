import { describe, expect, it } from 'vitest';
import {
	BATCH_SERVING_MULTIPLIERS,
	batchServingMultiplier,
	batchServingTarget
} from './meal_batch';

it('offers only whole batch multipliers from one through four', () => {
	expect(BATCH_SERVING_MULTIPLIERS).toEqual([1, 2, 3, 4]);
});

describe('batchServingTarget', () => {
	it('uses the saved recipe yield rather than the current meal count', () => {
		expect(batchServingTarget(6, 2)).toBe(12);
	});

	it('allows a one-portion recipe and the upper bound', () => {
		expect(batchServingTarget(1, 4)).toBe(4);
		expect(batchServingTarget(33, 3)).toBe(99);
	});

	it('disables missing and out-of-range targets', () => {
		expect(batchServingTarget(null, 1)).toBeNull();
		expect(batchServingTarget(50, 2)).toBeNull();
		expect(batchServingTarget(0, 1)).toBeNull();
	});
});

describe('batchServingMultiplier', () => {
	it('recognizes whole recipe batches and leaves custom portion counts unselected', () => {
		expect(batchServingMultiplier(6, 6)).toBe(1);
		expect(batchServingMultiplier(6, 18)).toBe(3);
		expect(batchServingMultiplier(6, 7)).toBeNull();
		expect(batchServingMultiplier(null, 4)).toBeNull();
	});
});
