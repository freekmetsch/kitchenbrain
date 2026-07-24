import { describe, expect, it } from 'vitest';
import {
	displayQuantity,
	matchesInventoryQuery,
	recipeCoverage,
	recipeRelationshipKind
} from './shared';

describe('inventory display quantity', () => {
	it('pluralizes portions in English and Dutch', () => {
		expect(displayQuantity(1, 'portion', 'en')).toBe('1 portion');
		expect(displayQuantity(2, 'portion', 'en')).toBe('2 portions');
		expect(displayQuantity(1, 'portion', 'nl')).toBe('1 portie');
		expect(displayQuantity(2, 'portion', 'nl')).toBe('2 porties');
	});

	it('localizes decimal values while preserving canonical units', () => {
		expect(displayQuantity(1.5, 'kg', 'en')).toBe('1.5 kg');
		expect(displayQuantity(1.5, 'kg', 'nl')).toBe('1,5 kg');
		expect(displayQuantity(2, 'stuk', 'nl')).toBe('2');
	});
});

describe('inventory recipe relationship', () => {
	it('keeps linked, planned, dismissed, and unresolved states distinct', () => {
		expect(recipeRelationshipKind({ recipeStatus: 'linked' }, { slug: 'soup' })).toBe('linked');
		expect(recipeRelationshipKind({ recipeStatus: 'plan_to_add' }, null)).toBe('planned');
		expect(recipeRelationshipKind({ recipeStatus: 'no_recipe' }, null)).toBe('not_needed');
		expect(recipeRelationshipKind({ recipeStatus: null }, null)).toBe('unresolved');
	});

	it('summarizes meal relationships without counting other stock', () => {
		expect(
			recipeCoverage([
				{ kind: 'leftover', madeFromRecipeId: 1, recipeStatus: 'linked' },
				{ kind: 'leftover', madeFromRecipeId: null, recipeStatus: 'plan_to_add' },
				{ kind: 'leftover', madeFromRecipeId: null, recipeStatus: 'no_recipe' },
				{ kind: 'leftover', madeFromRecipeId: null, recipeStatus: null },
				{ kind: 'ingredient', madeFromRecipeId: null, recipeStatus: null }
			])
		).toEqual({ linked: 1, planned: 1, not_needed: 1, unresolved: 1 });
	});
});

describe('inventory search', () => {
	it('matches every query term across row facts', () => {
		expect(matchesInventoryQuery('chicken freezer', ['Chicken soup', 'freezer', 'meal'])).toBe(true);
		expect(matchesInventoryQuery('chicken pantry', ['Chicken soup', 'freezer', 'meal'])).toBe(false);
	});

	it('is case- and accent-insensitive', () => {
		expect(matchesInventoryQuery('puree', ['Tomatenpurée', 'Voorraadkast'])).toBe(true);
		expect(matchesInventoryQuery('', ['Anything'])).toBe(true);
	});
});
