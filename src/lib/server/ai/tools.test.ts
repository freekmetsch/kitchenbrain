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

	it('stages one reviewed meal-plan bundle without forcing recommendation filler', () => {
		const proposal = tool('propose_meal_plan').input_schema as {
			properties?: Record<
				string,
				{
					required?: string[];
					items?: { oneOf?: unknown[] };
					properties?: Record<string, unknown>;
				}
			>;
		};
		expect(proposal.properties?.recommendation?.required).toEqual([]);
		expect(proposal.properties?.recommendation?.properties).toEqual(
			expect.objectContaining({
				why_now: expect.any(Object),
				evidence: expect.any(Object),
				confidence: expect.any(Object),
				uncertainty: expect.any(Object),
				consequence: expect.any(Object),
				alternatives: expect.any(Object)
			})
		);
		expect(proposal.properties?.operations?.items?.oneOf).toHaveLength(3);
		expect(JSON.stringify(proposal)).toContain('meal_id');
		expect(JSON.stringify(proposal)).toContain('recipe_slug');
		expect(
			(tool('get_meal_plan').input_schema.properties as Record<string, unknown>)
		).toHaveProperty('include_missed');
	});

	it('consolidates cooked checkout, timers, rescue, and defrost into one cooking proposal', () => {
		const names = tools.map((candidate) => candidate.name);
		expect(names).not.toContain('mark_meal_cooked');
		const cooking = tool('prepare_cooking_action');
		expect(
			(cooking.input_schema.properties as Record<string, { enum?: string[] }>).action.enum
		).toEqual(['after_cook', 'timer', 'rescue', 'defrost']);

		expect(
			toolsForAssistantTurn('Start a ten minute timer for pasta').map(
				(candidate) => candidate.name
			)
		).toEqual(['prepare_cooking_action']);
		expect(
			toolsForAssistantTurn('The sauce in our saved curry is too salty').map(
				(candidate) => candidate.name
			)
		).toEqual(['get_recipe']);
		expect(
			assistantToolRoute(
				'The sauce in our saved curry is too salty',
				false,
				[],
				['get_recipe']
			)
		).toMatchObject({ forcedToolName: 'prepare_cooking_action' });
		expect(
			toolsForAssistantTurn('Remind me to defrost freezer chili').map(
				(candidate) => candidate.name
			)
		).toEqual(['get_inventory']);
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
			toolsForAssistantTurn('We ate the freezer curry tonight. Finish it properly.').map(
				(candidate) => candidate.name
			)
		).toEqual(['get_meal_plan']);
		const afterCookReview = assistantToolRoute(
			'We ate the freezer curry tonight. Finish it properly.',
			false,
			[],
			['get_meal_plan']
		);
		expect(afterCookReview.forcedToolName).toBe('prepare_cooking_action');
		expect(afterCookReview.tools.map((candidate) => candidate.name)).toEqual([
			'get_meal_plan',
			'prepare_cooking_action'
		]);
		expect(
			toolsForAssistantTurn('Sort out dinners for next week').map((candidate) => candidate.name)
		).toEqual(['get_meal_plan']);
		expect(
			toolsForAssistantTurn(
				'Compare meals we can cook entirely or almost entirely from stock.'
			).map((candidate) => candidate.name)
		).toEqual(['suggest_meals']);
	});

	it('distinguishes finished ingredients from finished meals across natural paraphrases', () => {
		for (const prompt of [
			'We finished the coriander. Remove it from stock.',
			'I finished the oat milk; take it out of inventory.',
			'We used all the coriander.',
			'Ik heb de koriander opgebruikt.'
		]) {
			expect(assistantToolRoute(prompt)).toMatchObject({
				forcedToolName: 'get_inventory',
				tools: [expect.objectContaining({ name: 'get_inventory' })]
			});
		}

		expect(
			toolsForAssistantTurn('We finished dinner and want to check out the meal.').map(
				(candidate) => candidate.name
			)
		).toEqual(['get_meal_plan']);
	});

	it('recognizes natural Dutch tonight requests and possessive week requests', () => {
		expect(
			toolsForAssistantTurn('Wat zullen we vanavond eten?').map((candidate) => candidate.name)
		).toEqual(['get_inventory']);
		expect(
			toolsForAssistantTurn("Plan next week's dinners for us.").map(
				(candidate) => candidate.name
			)
		).toEqual(['get_meal_plan']);
	});

	it('keeps a broad bilingual paraphrase matrix on small deterministic routes', () => {
		const cases: Array<[prompt: string, firstTool: string | null]> = [
			['Which stock is oldest in the pantry?', 'get_inventory'],
			['Welke voorraad in de koelkast staat er nog?', 'get_inventory'],
			['Put three portions of soup in the freezer.', 'get_inventory'],
			['Leg twee pakken spinazie in de vriezer.', 'get_inventory'],
			['I used up the basil; remove it from inventory.', 'get_inventory'],
			['Wij hebben alle koriander opgebruikt.', 'get_inventory'],
			[
				'Update the lentils expiry and the soup frozen date together.',
				'get_inventory'
			],
			[
				'Wijzig de houdbaarheidsdatum en de invriesdatum samen.',
				'get_inventory'
			],
			['We are out of oats; prepare the right changes.', 'get_inventory'],
			['De rijst is op; zet de juiste wijzigingen klaar.', 'get_inventory'],
			['Mark the bread bought on the shopping list.', 'prepare_stock_action'],
			['Verwijder koriander van de boodschappenlijst.', 'prepare_stock_action'],
			['Unpack the grocery haul from my dictation.', 'prepare_stock_action'],
			['We hebben melk gekocht; pak de boodschappen uit.', 'prepare_stock_action'],
			['Refill the pantry to its par target.', 'prepare_stock_action'],
			['Vul de voorraad aan tot het streefaantal.', 'prepare_stock_action'],
			['Prepare a freezer batch-cook refill.', 'get_freezer_staples'],
			['Maak een batch om de vriezerdoelen aan te vullen.', 'get_freezer_staples'],
			['Move Tuesday dinner to Thursday.', 'get_meal_plan'],
			['Verplaats de maaltijd van dinsdag naar donderdag.', 'get_meal_plan'],
			["Plan next week's dinners.", 'get_meal_plan'],
			['Plan het avondeten voor komende week.', 'get_meal_plan'],
			['What are we having for dinner tonight?', 'get_inventory'],
			['Wat kunnen we vanavond eten?', 'get_inventory'],
			['Move the missed dinners into this week.', 'get_meal_plan'],
			['Schuif de gemiste maaltijden door.', 'get_meal_plan'],
			['Make meals entirely from stock.', 'suggest_meals'],
			['Wat kunnen we koken uit de voorraad?', 'suggest_meals'],
			['Rebuild this week’s shopping list.', 'generate_shopping_list'],
			['Bouw de boodschappenlijst opnieuw op.', 'generate_shopping_list'],
			['Who removed soup from the freezer stock?', 'get_inventory_history'],
			['Wie verwijderde soep uit de vriezer?', 'get_inventory_history'],
			['Set a timer for the potatoes.', 'prepare_cooking_action'],
			['De saus is te dun.', 'get_recipe'],
			['Prepare a cue to thaw the curry.', 'get_inventory'],
			['Wij hebben de curry gegeten.', 'get_meal_plan'],
			['How much coconut milk is in our saved curry?', 'search_recipes'],
			['Importeer het recept van https://example.test/soep.', 'add_recipe_from_url'],
			[
				'For our saved pasta, prepare AH alternatives for review.',
				'search_recipes'
			],
			['Why does resting pancake batter change its texture?', null]
		];

		for (const [prompt, firstTool] of cases) {
			const route = assistantToolRoute(prompt);
			expect(route.forcedToolName ?? null, prompt).toBe(firstTool);
			expect(route.tools.length, prompt).toBeLessThanOrEqual(4);
		}

		expect(
			assistantToolRoute('Why does this batter look split?', true).tools.length
		).toBe(tools.length);
	});
});
