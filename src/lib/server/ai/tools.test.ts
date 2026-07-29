import { describe, expect, it } from 'vitest';
import { assistantToolRoute, tools, toolsForAssistantTurn } from './tools';

function tool(name: string) {
	return tools.find((candidate) => candidate.name === name)!;
}

describe('recipe continuity tool contracts', () => {
	it('routes every conversational plan edit through the reviewed proposal', () => {
		const names = tools.map((candidate) => candidate.name);
		expect(names).not.toContain('plan_meal');
		expect(names).not.toContain('remove_meal');
		expect(JSON.stringify(tool('propose_meal_plan'))).toContain('servings');
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

	it('types recipe operations and opaque product-choice candidates separately', () => {
		const proposal = tool('propose_recipe_patch').input_schema as {
			properties?: Record<string, { items?: { oneOf?: unknown[]; properties?: Record<string, unknown> } }>;
		};
		const operations = proposal.properties?.operations;
		const productChoices = proposal.properties?.product_choices;
		expect(operations?.items?.oneOf).toHaveLength(4);
		expect(productChoices?.items?.properties).toHaveProperty('candidates');
		expect(JSON.stringify(productChoices)).toContain('evidence_key');
		expect(JSON.stringify(productChoices)).not.toContain('product_id');
		expect(JSON.stringify(productChoices)).toContain('Canonical purchase-form category');
	});

	it('stages one reviewed meal-plan bundle with a complete recommendation envelope', () => {
		const proposal = tool('propose_meal_plan').input_schema as {
			properties?: Record<string, { required?: string[]; items?: { oneOf?: unknown[] } }>;
		};
		expect(proposal.properties?.recommendation?.required).toEqual(
			expect.arrayContaining([
				'why_now',
				'evidence',
				'confidence',
				'uncertainty',
				'consequence',
				'alternatives'
			])
		);
		expect(proposal.properties?.operations?.items?.oneOf).toHaveLength(3);
		expect(JSON.stringify(proposal)).toContain('meal_id');
		expect(JSON.stringify(proposal)).toContain('recipe_slug');
		expect(
			(tool('get_meal_plan').input_schema.properties as Record<string, unknown>)
		).toHaveProperty('include_missed');
	});

	it('routes the consolidated Stock proposal only to relevant turns', () => {
		expect(toolsForAssistantTurn('Sort out dinners for next week').map((candidate) => candidate.name))
			.not.toContain('prepare_stock_action');
		expect(assistantToolRoute('We used the last rice')).toMatchObject({
			forcedToolName: 'get_inventory',
			tools: [expect.objectContaining({ name: 'get_inventory' })]
		});
		const replacementReview = assistantToolRoute(
			'We used the last rice',
			false,
			[],
			['get_inventory']
		);
		expect(replacementReview.forcedToolName).toBe('prepare_stock_action');
		expect(replacementReview.tools.map((candidate) => candidate.name)).toEqual([
			'get_inventory',
			'prepare_stock_action'
		]);
		expect(
			toolsForAssistantTurn('Remove coriander from the shopping list').map(
				(candidate) => candidate.name
			)
		).toContain('prepare_stock_action');
		expect(
			toolsForAssistantTurn('Save this soup recipe', true).map((candidate) => candidate.name)
		).toContain('prepare_stock_action');
		expect(
			toolsForAssistantTurn('Save this soup recipe', true).map((candidate) => candidate.name)
		).toContain('add_recipe');
		expect(
			toolsForAssistantTurn('Unpack these groceries', true).map((candidate) => candidate.name)
		).toContain('prepare_stock_action');
		expect(toolsForAssistantTurn('Unpack these groceries', true)).toHaveLength(1);
		expect(
			toolsForAssistantTurn('Make it two', false, ['prepare_stock_action']).map(
				(candidate) => candidate.name
			)
		).toEqual(['prepare_stock_action']);
		expect(
			toolsForAssistantTurn('Prepare a freezer refill plan').map((candidate) => candidate.name)
		).toEqual(['get_freezer_staples']);
		expect(
			toolsForAssistantTurn(
				'Prepare a batch-cook refill plan for our freezer targets that fits the coming week.'
			).map((candidate) => candidate.name)
		).toEqual(['get_freezer_staples']);
		const freezerReview = assistantToolRoute(
			'Prepare a freezer refill plan',
			false,
			[],
			['get_freezer_staples', 'get_meal_plan', 'suggest_meals']
		);
		expect(freezerReview.forcedToolName).toBe('propose_meal_plan');
		expect(freezerReview.tools.map((candidate) => candidate.name)).toEqual([
			'get_meal_plan',
			'suggest_meals',
			'propose_meal_plan',
			'get_freezer_staples'
		]);
		expect(
			toolsForAssistantTurn('Verplaats de curry van dinsdag naar donderdag.').map(
				(candidate) => candidate.name
			)
		).toEqual(['get_meal_plan']);
		expect(
			toolsForAssistantTurn('Move the missed dinners into this week for review.').map(
				(candidate) => candidate.name
			)
		).toEqual(['get_meal_plan']);
		expect(
			assistantToolRoute(
				'Schuif de gemiste maaltijden door en laat me de wijzigingen controleren.',
				false,
				[],
				['get_meal_plan']
			).forcedToolName
		).toBe('propose_meal_plan');
		expect(
			toolsForAssistantTurn('Sort out dinners for next week').map((candidate) => candidate.name)
		).toEqual(['get_meal_plan']);
		expect(
			toolsForAssistantTurn(
				'Compare meals we can cook entirely or almost entirely from stock.'
			).map((candidate) => candidate.name)
		).toEqual(['suggest_meals']);
	});
});
