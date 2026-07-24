import { describe, expect, it } from 'vitest';
import { displayQuantity, recipeRelationshipKind } from './shared';

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
});
