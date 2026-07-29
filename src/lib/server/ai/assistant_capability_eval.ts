import type Anthropic from '@anthropic-ai/sdk';

export const ASSISTANT_TOOL_BUDGET = Object.freeze({
	baselineCount: 26,
	baselineSerializedBytes: 22_407,
	maxCount: 27,
	maxSerializedBytes: 26_000
});

export type AssistantCapabilityEvalCase = {
	id: string;
	domain: 'inventory' | 'planning' | 'recipes' | 'shopping' | 'cross-domain' | 'knowledge';
	locale: 'en' | 'nl';
	prompt: string;
	allowedFirstTools: string[];
	requiredTools: string[];
	forbiddenTools: string[];
	requiresReview: boolean;
	expectNoTool?: boolean;
	knownBaselineFailure?: string;
};

/**
 * Synthetic, non-household prompts used by both the provider-free contract test and the bounded
 * live-model evaluator. They intentionally test user language, not database-operation wording.
 */
export const ASSISTANT_CAPABILITY_EVAL_CASES: readonly AssistantCapabilityEvalCase[] = Object.freeze([
	{
		id: 'inventory-read-en',
		domain: 'inventory',
		locale: 'en',
		prompt: 'What do we currently have in the freezer?',
		allowedFirstTools: ['get_inventory'],
		requiredTools: ['get_inventory'],
		forbiddenTools: [],
		requiresReview: false
	},
	{
		id: 'inventory-read-nl',
		domain: 'inventory',
		locale: 'nl',
		prompt: 'Welke voorraad in de vriezer is het oudst?',
		allowedFirstTools: ['get_inventory'],
		requiredTools: ['get_inventory'],
		forbiddenTools: [],
		requiresReview: false
	},
	{
		id: 'inventory-add',
		domain: 'inventory',
		locale: 'en',
		prompt: 'Add two cartons of oat milk to the pantry.',
		allowedFirstTools: ['get_inventory'],
		requiredTools: ['get_inventory', 'add_to_inventory'],
		forbiddenTools: ['remove_from_inventory'],
		requiresReview: false
	},
	{
		id: 'inventory-remove',
		domain: 'inventory',
		locale: 'en',
		prompt: 'We finished the coriander. Remove it from stock.',
		allowedFirstTools: ['get_inventory'],
		requiredTools: ['get_inventory', 'remove_from_inventory'],
		forbiddenTools: ['add_to_inventory'],
		requiresReview: true
	},
	{
		id: 'inventory-bulk-correction',
		domain: 'inventory',
		locale: 'en',
		prompt:
			'Set the lentils best-before date to 30 September 2026 and the tomato soup frozen date to 1 May 2026 together.',
		allowedFirstTools: ['get_inventory'],
		requiredTools: ['get_inventory', 'bulk_update_inventory'],
		forbiddenTools: [],
		requiresReview: true
	},
	{
		id: 'tonight-choice',
		domain: 'planning',
		locale: 'en',
		prompt: 'What should we eat tonight? Give me your best choice and two alternatives.',
		allowedFirstTools: ['get_inventory', 'get_meal_plan', 'suggest_meals'],
		requiredTools: ['suggest_meals'],
		forbiddenTools: ['propose_meal_plan'],
		requiresReview: false
	},
	{
		id: 'exact-cook-from-stock',
		domain: 'cross-domain',
		locale: 'en',
		prompt:
			'Compare saved meals we can cook entirely or almost entirely from stock. Show the exact on-hand and missing items for every option.',
		allowedFirstTools: ['get_inventory', 'suggest_meals'],
		requiredTools: ['suggest_meals'],
		forbiddenTools: ['propose_meal_plan', 'prepare_stock_action'],
		requiresReview: false
	},
	{
		id: 'week-proposal',
		domain: 'planning',
		locale: 'en',
		prompt: 'Sort out dinners for next week and bring me one week to review.',
		allowedFirstTools: ['get_meal_plan', 'suggest_meals'],
		requiredTools: ['get_meal_plan', 'propose_meal_plan'],
		forbiddenTools: [],
		requiresReview: true
	},
	{
		id: 'meal-edit',
		domain: 'planning',
		locale: 'nl',
		prompt: 'Verplaats de curry van dinsdag naar donderdag en laat me de wijziging controleren.',
		allowedFirstTools: ['get_meal_plan'],
		requiredTools: ['get_meal_plan', 'propose_meal_plan'],
		forbiddenTools: ['mark_meal_cooked'],
		requiresReview: true
	},
	{
		id: 'recipe-read',
		domain: 'recipes',
		locale: 'en',
		prompt: 'How much coconut milk is in our saved lentil curry?',
		allowedFirstTools: ['get_recipe', 'search_recipes'],
		requiredTools: ['get_recipe'],
		forbiddenTools: ['edit_recipe'],
		requiresReview: false
	},
	{
		id: 'recipe-import',
		domain: 'recipes',
		locale: 'en',
		prompt: 'Save the recipe from https://example.test/soup.',
		allowedFirstTools: ['add_recipe_from_url'],
		requiredTools: ['add_recipe_from_url'],
		forbiddenTools: ['add_recipe'],
		requiresReview: false
	},
	{
		id: 'recipe-ah-choice',
		domain: 'recipes',
		locale: 'en',
		prompt: 'For our saved tomato pasta, prepare three genuinely different AH tomato forms for review.',
		allowedFirstTools: ['get_recipe', 'search_recipes'],
		requiredTools: ['get_recipe', 'search_ah_products', 'propose_recipe_patch'],
		forbiddenTools: ['edit_recipe'],
		requiresReview: true
	},
	{
		id: 'shopping-reconcile',
		domain: 'shopping',
		locale: 'en',
		prompt: 'Reconcile the shopping list for this week from the current meal plan.',
		allowedFirstTools: ['get_meal_plan', 'generate_shopping_list'],
		requiredTools: ['generate_shopping_list'],
		forbiddenTools: ['search_ah_products'],
		requiresReview: false
	},
	{
		id: 'cross-domain-out-of',
		domain: 'cross-domain',
		locale: 'en',
		prompt: 'We are out of rice. Check stock and prepare what should change.',
		allowedFirstTools: ['get_inventory'],
		requiredTools: ['get_inventory', 'prepare_stock_action'],
		forbiddenTools: ['add_to_inventory', 'remove_from_inventory'],
		requiresReview: true
	},
	{
		id: 'shopping-control',
		domain: 'shopping',
		locale: 'en',
		prompt: 'Remove coriander from this week’s shopping list and bring me the change to review.',
		allowedFirstTools: ['prepare_stock_action'],
		requiredTools: ['prepare_stock_action'],
		forbiddenTools: ['generate_shopping_list'],
		requiresReview: true
	},
	{
		id: 'used-last-bundle-nl',
		domain: 'cross-domain',
		locale: 'nl',
		prompt: 'We hebben de laatste rijst gebruikt. Zet de juiste wijzigingen voor me klaar.',
		allowedFirstTools: ['get_inventory'],
		requiredTools: ['get_inventory', 'prepare_stock_action'],
		forbiddenTools: ['add_to_inventory', 'remove_from_inventory'],
		requiresReview: true
	},
	{
		id: 'grocery-voice-intake',
		domain: 'cross-domain',
		locale: 'en',
		prompt:
			'Unpack this grocery haul from my dictation: one litre of milk for the fridge and two bags of peas for the freezer. Prepare it for review.',
		allowedFirstTools: ['prepare_stock_action'],
		requiredTools: ['prepare_stock_action'],
		forbiddenTools: ['add_to_inventory'],
		requiresReview: true
	},
	{
		id: 'freezer-refill-plan',
		domain: 'cross-domain',
		locale: 'en',
		prompt:
			'Prepare a batch-cook refill plan for our freezer targets that fits the coming week, then bring me the plan to review.',
		allowedFirstTools: ['get_freezer_staples', 'get_meal_plan', 'suggest_meals'],
		requiredTools: ['get_freezer_staples', 'get_meal_plan', 'suggest_meals', 'propose_meal_plan'],
		forbiddenTools: ['set_freezer_staple', 'prepare_stock_action'],
		requiresReview: true
	},
	{
		id: 'history-read',
		domain: 'inventory',
		locale: 'en',
		prompt: 'Who changed the freezer stock most recently?',
		allowedFirstTools: ['get_inventory_history'],
		requiredTools: ['get_inventory_history'],
		forbiddenTools: ['undo_op'],
		requiresReview: false
	},
	{
		id: 'plain-cooking-knowledge',
		domain: 'knowledge',
		locale: 'en',
		prompt: 'Why does resting pancake batter change the texture?',
		allowedFirstTools: [],
		requiredTools: [],
		forbiddenTools: [],
		requiresReview: false,
		expectNoTool: true
	}
]);

export function measureAssistantTools(toolSet: readonly Anthropic.Tool[]): {
	count: number;
	serializedBytes: number;
} {
	return {
		count: toolSet.length,
		serializedBytes: new TextEncoder().encode(JSON.stringify(toolSet)).byteLength
	};
}

export function assertAssistantToolBudget(toolSet: readonly Anthropic.Tool[]): void {
	const measurement = measureAssistantTools(toolSet);
	if (
		measurement.count > ASSISTANT_TOOL_BUDGET.maxCount ||
		measurement.serializedBytes > ASSISTANT_TOOL_BUDGET.maxSerializedBytes
	) {
		throw new Error(
			`Assistant tool budget exceeded: ${measurement.count}/${ASSISTANT_TOOL_BUDGET.maxCount} tools, ` +
				`${measurement.serializedBytes}/${ASSISTANT_TOOL_BUDGET.maxSerializedBytes} serialized bytes`
		);
	}
}

export function evaluateAssistantToolOrder(
	scenario: AssistantCapabilityEvalCase,
	toolOrder: readonly string[]
): string | null {
	if (scenario.expectNoTool && toolOrder.length > 0) return 'EXPECTED_NO_TOOL';
	if (
		!scenario.expectNoTool &&
		scenario.allowedFirstTools.length > 0 &&
		!scenario.allowedFirstTools.includes(toolOrder[0] ?? '')
	) {
		return 'WRONG_FIRST_TOOL';
	}
	for (const required of scenario.requiredTools) {
		if (!toolOrder.includes(required)) return `MISSING_REQUIRED_TOOL:${required}`;
	}
	for (const forbidden of scenario.forbiddenTools) {
		if (toolOrder.includes(forbidden)) return `FORBIDDEN_TOOL:${forbidden}`;
	}
	return null;
}
