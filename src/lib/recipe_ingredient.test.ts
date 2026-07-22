import { describe, expect, it } from 'vitest';
import {
	LiveIngredientSchema,
	NewIngredientSchema,
	StoredIngredientSchema,
	mergeLiveIngredients
} from './recipe_ingredient';

describe('recipe ingredient compatibility schemas', () => {
	it('reads trusted provenance and future fields while live input rejects it', () => {
		const futureIngredient = {
			id: 'ingredient-7',
			name: 'Parmezaan',
			amount: '50',
			unit: 'g',
			origin: 'ai_accepted',
			futureField: { keep: true }
		};

		expect(StoredIngredientSchema.parse(futureIngredient)).toEqual(futureIngredient);
		expect(LiveIngredientSchema.safeParse(futureIngredient).success).toBe(false);
		expect(NewIngredientSchema.safeParse({ name: 'Ui', amount: '1', id: 'forged' }).success).toBe(false);
	});

	it('preserves stored IDs, trusted provenance, and unknown fields during a live edit', () => {
		const merged = mergeLiveIngredients(
			[
				{
					id: 'ingredient-7',
					name: 'Parmezaan',
					amount: '50',
					origin: 'ai_accepted',
					futureField: 'keep'
				}
			],
			[{ id: 'ingredient-7', name: 'Parmigiano Reggiano', amount: '60' }]
		);

		expect(merged).toEqual([
			{
				id: 'ingredient-7',
				name: 'Parmigiano Reggiano',
				amount: '60',
				origin: 'ai_accepted',
				futureField: 'keep'
			}
		]);
	});

	it('rejects a forged ingredient ID', () => {
		expect(() =>
			mergeLiveIngredients(
				[{ name: 'Ui', amount: '1' }],
				[{ id: 'forged', name: 'Ui', amount: '1' }]
			)
		).toThrow('Ingredient ID does not belong to this recipe');
	});

	it('rejects duplicate submitted IDs instead of cloning trusted provenance', () => {
		expect(() =>
			mergeLiveIngredients(
				[{ id: 'trusted', name: 'Basilicum', amount: '1', origin: 'ai_accepted' }],
				[
					{ id: 'trusted', name: 'Basilicum', amount: '1' },
					{ id: 'trusted', name: 'Peterselie', amount: '1' }
				]
			)
		).toThrow('Ingredient IDs must be unique within a recipe');
	});

	it('preserves unknown substitute fields during a live edit', () => {
		const merged = mergeLiveIngredients(
			[
				{
					id: 'protein',
					name: 'Kip',
					amount: '300',
					substitutes: [{ name: 'Tofu', note: 'Stevig', futureField: 'keep' }]
				}
			],
			[
				{
					id: 'protein',
					name: 'Kip',
					amount: '300',
					substitutes: [{ name: 'Tofu', note: 'Extra stevig' }]
				}
			]
		);

		expect(merged[0].substitutes).toEqual([
			{ name: 'Tofu', note: 'Extra stevig', futureField: 'keep' }
		]);
	});

	it('does not transfer protected fields when an unkeyed ingredient is removed', () => {
		const merged = mergeLiveIngredients(
			[
				{ name: 'Basilicum', amount: '1', origin: 'ai_accepted', futureField: 'first' },
				{ name: 'Tomaat', amount: '4', futureField: 'second' }
			],
			[{ name: 'Tomaat', amount: '5' }]
		);

		expect(merged).toEqual([{ name: 'Tomaat', amount: '5', futureField: 'second' }]);
	});

	it('uses enrichment source indexes when AI additions change output order', () => {
		const merged = mergeLiveIngredients(
			[
				{ id: 'onion', name: 'Ui', amount: '1', futureField: 'keep-onion' },
				{ id: 'tomato', name: 'Tomaat', amount: '4', origin: 'ai_accepted' }
			],
			[
				{ name: 'Knoflook', amount: '1', optional: true, origin: 'ai_suggested' },
				{ name: 'Ui', amount: '1', origin: 'source' },
				{ name: 'Tomaat', amount: '4', origin: 'source' }
			],
			[null, 0, 1]
		);

		expect(merged[0].id).toMatch(/^ing_/);
		expect(merged[1]).toMatchObject({ id: 'onion', futureField: 'keep-onion' });
		expect(merged[2]).toMatchObject({ id: 'tomato', origin: 'ai_accepted' });
	});
});
