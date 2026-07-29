import { describe, expect, it } from 'vitest';
import { inventoryParStatus, validateParLevel } from './par_level';

describe('pantry par levels', () => {
	it('reports a deterministic deficit only for known compatible quantities', () => {
		expect(
			inventoryParStatus({
				section: 'pantry',
				qtyNum: 1,
				unit: 'pakken',
				parTargetQty: 3,
				parTargetUnit: 'pak'
			})
		).toEqual({ state: 'below', deficitQty: 2, unit: 'pak' });

		expect(
			inventoryParStatus({
				section: 'pantry',
				qtyNum: 4,
				unit: 'pak',
				parTargetQty: 3,
				parTargetUnit: 'pakken'
			})
		).toEqual({ state: 'at_or_above', unit: 'pak' });
	});

	it('exposes uncertainty rather than inventing a refill quantity', () => {
		expect(
			inventoryParStatus({
				section: 'pantry',
				qtyNum: null,
				unit: 'pak',
				parTargetQty: 3,
				parTargetUnit: 'pak'
			})
		).toEqual({ state: 'unknown', reason: 'quantity_unknown', unit: 'pak' });

		expect(
			inventoryParStatus({
				section: 'pantry',
				qtyNum: 500,
				unit: 'g',
				parTargetQty: 2,
				parTargetUnit: 'pak'
			})
		).toEqual({ state: 'unknown', reason: 'unit_mismatch', unit: 'pak' });
	});

	it('requires a positive, pantry-only, complete target', () => {
		expect(
			validateParLevel({
				section: 'fridge',
				qtyNum: 1,
				unit: 'l',
				parTargetQty: 2,
				parTargetUnit: 'l'
			})
		).toEqual({ ok: false, error: 'Par targets are only available for pantry items.' });
		expect(
			validateParLevel({
				section: 'pantry',
				qtyNum: 1,
				unit: 'pak',
				parTargetQty: 0,
				parTargetUnit: 'pak'
			})
		).toEqual({ ok: false, error: 'Par target quantity must be greater than zero.' });
		expect(
			validateParLevel({
				section: 'pantry',
				qtyNum: 1,
				unit: 'pak',
				parTargetQty: 2,
				parTargetUnit: null
			})
		).toEqual({ ok: false, error: 'Par target quantity and unit must be set or cleared together.' });
	});
});
