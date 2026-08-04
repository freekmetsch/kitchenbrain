import { describe, expect, it } from 'vitest';
import type { Ingredient } from '$lib/recipe_ingredient';
import { reviewRecipeQuality } from './quality';

function ingredient(fields: Partial<Ingredient> & Pick<Ingredient, 'name' | 'amount'>): Ingredient {
	return fields as Ingredient;
}

describe('assistant recipe quality review', () => {
	it('flags a mass or volume quantity that conflicts with its ingredient line', () => {
		const warnings = reviewRecipeQuality(
			[ingredient({ name: 'water', amount: '350', unit: 'ml', scale: 'linear' })],
			['Add 100 ml water to the sauce.']
		);

		expect(warnings).toEqual([
			expect.objectContaining({ code: 'quantity_conflict', ingredient: 'water' })
		]);
	});

	it('normalizes equivalent units and ignores times, temperatures, pan sizes, and partitive steps', () => {
		const warnings = reviewRecipeQuality(
			[ingredient({ name: 'water', amount: '1000', unit: 'ml', scale: 'linear' })],
			[
				'Add 1 liter water to a 2 l pan.',
				'Cook the water for 10 minutes at 180 C.',
				'Add half of the water now.'
			]
		);

		expect(warnings).toEqual([]);
	});

	it('does not match an ingredient name inside another word', () => {
		const warnings = reviewRecipeQuality(
			[ingredient({ name: 'water', amount: '1000', unit: 'ml', scale: 'linear' })],
			['Blend 100 ml watermeloen until smooth.']
		);

		expect(warnings).toEqual([]);
	});

	it('flags only impractical fractions of whole ingredients', () => {
		const warnings = reviewRecipeQuality(
			[
				ingredient({ name: 'paprika', amount: '3.5', scale: 'whole' }),
				ingredient({ name: 'ui', amount: '1.5', scale: 'whole' }),
				ingredient({ name: 'citroen', amount: '0.5', scale: 'whole' }),
				ingredient({ name: 'bloem', amount: '2.5', unit: 'kg', scale: 'whole' }),
				ingredient({ name: 'tomaat', amount: '3.5', scale: 'linear' })
			],
			[]
		);

		expect(warnings).toEqual([
			expect.objectContaining({ code: 'fractional_whole', ingredient: 'paprika' })
		]);
	});

	it('flags exact duplicate utility ingredients but keeps distinct components separate', () => {
		const warnings = reviewRecipeQuality(
			[
				ingredient({ name: 'water', amount: '100', unit: 'ml', component: 'saus' }),
				ingredient({ name: 'Water', amount: '250', unit: 'ML', component: 'saus' }),
				ingredient({ name: 'zout', amount: '1', unit: 'tl', component: 'saus' }),
				ingredient({ name: 'zout', amount: '1', unit: 'tl', component: 'rijst' })
			],
			[]
		);

		expect(warnings).toEqual([
			expect.objectContaining({ code: 'duplicate_utility', ingredient: 'Water' })
		]);
	});

	it('does not flag repeated non-utility ingredients or utility ingredients with distinct roles', () => {
		const warnings = reviewRecipeQuality(
			[
				ingredient({ name: 'tomaat', amount: '2', unit: 'stuks' }),
				ingredient({ name: 'tomaat', amount: '3', unit: 'stuks' }),
				ingredient({ name: 'water', amount: '100', unit: 'ml', role: 'cook_in' }),
				ingredient({ name: 'water', amount: '100', unit: 'ml', role: 'serve_fresh' })
			],
			[]
		);

		expect(warnings).toEqual([]);
	});
});
