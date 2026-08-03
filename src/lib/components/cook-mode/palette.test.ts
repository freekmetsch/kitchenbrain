import { describe, expect, it } from 'vitest';
import { cookPaletteGraph } from './palette';

describe('cook palette graph', () => {
	it('gives a merge a color distinct from both incoming streams', () => {
		const assignments = cookPaletteGraph(
			[{ id: 'base' }, { id: 'filling' }, { id: 'cake' }],
			[
				{ stream_id: 'base' },
				{ stream_id: 'filling' },
				{ stream_id: 'cake', merges_from: ['base', 'filling'] }
			]
		);
		expect(assignments[2].result).not.toBe(assignments[0].result);
		expect(assignments[2].result).not.toBe(assignments[1].result);
	});

	it('keeps unique incoming colors in first-seen merge order', () => {
		const assignments = cookPaletteGraph(
			[{ id: 'base' }, { id: 'filling' }, { id: 'cake' }],
			[
				{ stream_id: 'base' },
				{ stream_id: 'filling' },
				{
					stream_id: 'cake',
					merges_from: ['base', 'unknown', 'base', 'filling']
				}
			]
		);

		expect(assignments[2].sources).toEqual([
			assignments[0].result,
			assignments[1].result
		]);
	});
});
