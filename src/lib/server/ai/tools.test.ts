import { describe, expect, it } from 'vitest';
import { tools } from './tools';

function tool(name: string) {
	return tools.find((candidate) => candidate.name === name)!;
}

describe('recipe continuity tool contracts', () => {
	it('lets chat preserve occasion portions when planning', () => {
		const properties = tool('plan_meal').input_schema.properties ?? {};
		expect(properties).toHaveProperty('servings');
	});

	it('requires rich ingredients for recipe creation', () => {
		const properties = (tool('add_recipe').input_schema.properties ?? {}) as Record<string, unknown>;
		const ingredient = properties.ingredients as { items?: { required?: string[] } };
		expect(ingredient.items?.required).toEqual(expect.arrayContaining([
			'role', 'optional', 'purchaseForm', 'scale', 'origin'
		]));
	});

	it('routes ingredient changes through the proposal tool', () => {
		const properties = (tool('edit_recipe').input_schema.properties ?? {}) as Record<string, unknown>;
		expect(properties).not.toHaveProperty('add_ingredients');
		expect(properties).not.toHaveProperty('remove_ingredient_names');
		expect(properties).not.toHaveProperty('set_ingredient_substitutes');
		expect(properties).not.toHaveProperty('notes');
		expect(properties).not.toHaveProperty('directions');
		expect(properties).not.toHaveProperty('servings');
		expect(tool('propose_recipe_patch')).toBeDefined();
	});

	it('exposes AH search as a bounded read-only tool', () => {
		const search = tool('search_ah_products');
		const properties = (search.input_schema.properties ?? {}) as Record<string, unknown>;
		expect(properties).toHaveProperty('queries');
		expect(properties).not.toHaveProperty('basket');
		expect(properties).not.toHaveProperty('quantity');
	});
});
