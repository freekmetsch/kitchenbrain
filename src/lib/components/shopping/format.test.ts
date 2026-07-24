import { describe, expect, it } from 'vitest';
import { sourceContextLabels } from './format';

describe('sourceContextLabels', () => {
	it('shows each distinct meal, recipe, and component behind a quantity', () => {
		expect(
			sourceContextLabels({
				mealNames: ['Friday dinner', 'Friday dinner'],
				recipeTitle: 'Taco night',
				component: 'Salsa'
			})
		).toEqual(['Friday dinner', 'Taco night', 'Salsa']);
	});
});
