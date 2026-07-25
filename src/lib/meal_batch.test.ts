import { describe, expect, it } from 'vitest';
import { batchServingTarget, batchServingToggleTarget } from './meal_batch';

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

describe('batchServingToggleTarget', () => {
	it('sets an inactive multiplier and returns an active multiplier to baseline', () => {
		expect(batchServingToggleTarget(6, 2, 6)).toBe(12);
		expect(batchServingToggleTarget(6, 2, 12)).toBe(6);
	});

	it('sets a multiplier from a custom portion count', () => {
		expect(batchServingToggleTarget(6, 3, 7)).toBe(18);
	});

	it('keeps unavailable multipliers disabled', () => {
		expect(batchServingToggleTarget(null, 2, 4)).toBeNull();
		expect(batchServingToggleTarget(50, 2, 50)).toBeNull();
	});
});
