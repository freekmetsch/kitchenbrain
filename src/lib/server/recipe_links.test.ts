import { describe, expect, it } from 'vitest';
import { ingredientRoleCoverage } from './recipe_links';

describe('ingredientRoleCoverage', () => {
	it('distinguishes zero, partial, and complete coverage', () => {
		expect(ingredientRoleCoverage([])).toEqual({
			total: 0,
			classified: 0,
			unknownNames: [],
			complete: false
		});
		expect(
			ingredientRoleCoverage([
				{ name: 'rijst', amount: '1', role: 'cook_in' },
				{ name: 'limoen', amount: '2' }
			])
		).toEqual({ total: 2, classified: 1, unknownNames: ['limoen'], complete: false });
		expect(
			ingredientRoleCoverage([
				{ name: 'rijst', amount: '1', role: 'cook_in' },
				{ name: 'limoen', amount: '2', role: 'serve_fresh' }
			])
		).toEqual({ total: 2, classified: 2, unknownNames: [], complete: true });
	});
});
