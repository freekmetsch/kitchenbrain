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

	it.each(['add_recipe', 'edit_recipe'])('requires rich ingredients for %s writes', (name) => {
		const properties = (tool(name).input_schema.properties ?? {}) as Record<string, unknown>;
		const ingredientProperty = name === 'add_recipe' ? properties.ingredients : properties.add_ingredients;
		const ingredient = ingredientProperty as { items?: { required?: string[] } };
		expect(ingredient.items?.required).toEqual(expect.arrayContaining([
			'role', 'optional', 'purchaseForm', 'scale', 'origin'
		]));
	});
});
