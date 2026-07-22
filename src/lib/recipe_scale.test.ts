import { describe, expect, it } from 'vitest';
import { occasionMultiplier, parseQuantity, projectIngredient, scaleAmount, sumCompatibleQuantities } from './recipe_scale';

describe('recipe quantity projection', () => {
	it.each([
		['1/2', { min: 0.5 }],
		['1 1/2', { min: 1.5 }],
		['1½', { min: 1.5 }],
		['1,5', { min: 1.5 }],
		['1-2', { min: 1, max: 2 }]
	])('parses %s', (input, expected) => {
		expect(parseQuantity(input)).toEqual(expected);
	});

	it('projects a 4-serving recipe to 6 servings exactly once', () => {
		expect(occasionMultiplier(4, 6)).toBe(1.5);
		expect(scaleAmount('200', 'rijst', occasionMultiplier(4, 6))).toBe('300');
	});

	it('supports explicit whole and fixed ingredient behavior', () => {
		expect(scaleAmount('2', 'eieren', 1.5, 'whole')).toBe('3');
		expect(scaleAmount('naar smaak', 'zout', 4, 'fixed')).toBe('naar smaak');
		expect(scaleAmount('1', 'snuf zout', 4, 'fixed')).toBe('1');
	});

	it('scales ranges and formats common fractions for either locale', () => {
		expect(scaleAmount('1-2', 'limoenen', 0.5)).toBe('½–1');
		expect(scaleAmount('1', 'cup', 0.5)).toBe('½');
		expect(scaleAmount('1', 'olie', 1.2, 'linear', 'en')).toBe('1.2');
		expect(scaleAmount('1', 'olie', 1.2, 'linear', 'nl')).toBe('1,2');
	});

	it('keeps null servings and fixed batches at their baseline until an override exists', () => {
		expect(occasionMultiplier(4, null)).toBe(1);
		expect(projectIngredient({ name: 'saus', amount: '500', scale: 'fixed' }, 4, 8).amount).toBe('500');
		// fixed_batch changes the default presentation, not the explicit override:
		// a deliberate half batch still projects linear ingredients.
		expect(projectIngredient({ name: 'rijst', amount: '400', scale: 'linear' }, 4, 2).amount).toBe('200');
	});

	it('sums compatible quantities but refuses incompatible units', () => {
		expect(sumCompatibleQuantities([{ amount: '1/2', unit: 'kg' }, { amount: '1', unit: 'kg' }])).toEqual({ amount: '1½', unit: 'kg' });
		expect(sumCompatibleQuantities([{ amount: '1', unit: 'kg' }, { amount: '500', unit: 'g' }])).toBeNull();
	});
});
