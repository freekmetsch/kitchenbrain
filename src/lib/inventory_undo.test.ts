import { describe, expect, it } from 'vitest';
import { captureRemoval, restoreRemoval } from './inventory_undo';

describe('inventory delete snapshots', () => {
	it('captures an independent snapshot and its original index', () => {
		const source = [
			{ id: 1, name: 'one' },
			{ id: 2, name: 'two' },
			{ id: 3, name: 'three' }
		];
		const result = captureRemoval(source, 2);

		expect(result.items.map((item) => item.id)).toEqual([1, 3]);
		expect(result.removed).toEqual({ item: { id: 2, name: 'two' }, index: 1 });
		expect(result.removed?.item).not.toBe(source[1]);
	});

	it('restores at the prior index without duplicating the row', () => {
		const removed = { item: { id: 2, name: 'two' }, index: 1 };

		expect(restoreRemoval([{ id: 1, name: 'one' }, { id: 3, name: 'three' }], removed)).toEqual([
			{ id: 1, name: 'one' },
			{ id: 2, name: 'two' },
			{ id: 3, name: 'three' }
		]);
		expect(restoreRemoval([{ id: 2, name: 'stale' }], removed)).toEqual([
			{ id: 2, name: 'two' }
		]);
	});
});
