import { describe, expect, it } from 'vitest';
import { foodCategoryAccent, presentFoodCategories } from './food_categories';

describe('foodCategoryAccent', () => {
	it('projects known categories to stable semantic accents', () => {
		expect(foodCategoryAccent('meat')).toBe('terra');
		expect(foodCategoryAccent('fish')).toBe('blue');
		expect(foodCategoryAccent('vegetarian')).toBe('sage');
		expect(foodCategoryAccent('pasta')).toBe('honey');
		expect(foodCategoryAccent('dessert')).toBe('berry');
	});

	it('normalizes aliases before selecting an accent', () => {
		expect(foodCategoryAccent('Vlees')).toBe('terra');
		expect(foodCategoryAccent('plant-based')).toBe('sage');
		expect(foodCategoryAccent('seafood')).toBe('blue');
	});

	it('uses the neutral fallback for unknown, blank, and absent categories', () => {
		expect(foodCategoryAccent('fusion')).toBe('neutral');
		expect(foodCategoryAccent('')).toBe('neutral');
		expect(foodCategoryAccent(null)).toBe('neutral');
		expect(foodCategoryAccent(undefined)).toBe('neutral');
	});
});

describe('presentFoodCategories', () => {
	it('normalizes, deduplicates, and canonically orders only categories that exist', () => {
		expect(
			presentFoodCategories(['Dessert', 'vlees', 'seafood', 'Vlees', null, 'fusion', 'brunch'])
		).toEqual(['meat', 'fish', 'dessert', 'brunch', 'fusion']);
	});

	it('drops blank categories without inventing filter choices', () => {
		expect(presentFoodCategories([null, undefined, '', '   '])).toEqual([]);
	});
});
