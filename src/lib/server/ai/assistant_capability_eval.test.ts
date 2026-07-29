import { describe, expect, it } from 'vitest';
import { assistantToolRoute, tools } from './tools';
import {
	ASSISTANT_CAPABILITY_EVAL_CASES,
	ASSISTANT_ROUTED_TOOL_BUDGET,
	ASSISTANT_TOOL_BUDGET,
	assertAssistantCapabilityEvalCatalog,
	assertAssistantToolBudget,
	evaluateAssistantToolOrder,
	measureAssistantTools
} from './assistant_capability_eval';

describe('Assistant capability quality gate', () => {
	it('keeps the complete shipped surface inside the checked exposure budget', () => {
		const measurement = measureAssistantTools(tools);

		expect(measurement.count).toBe(27);
		expect(measurement.serializedBytes).toBe(24_737);
		expect(() => assertAssistantToolBudget(tools)).not.toThrow();
		expect(ASSISTANT_TOOL_BUDGET.maxCount).toBe(27);
	});

	it('fails closed when either tool count or schema size exceeds the budget', () => {
		const extra = {
			name: 'speculative_tool',
			description: 'x'.repeat(4_500),
			input_schema: { type: 'object' as const, properties: {}, required: [] }
		};

		expect(() => assertAssistantToolBudget([...tools, extra])).toThrow(/tool budget/i);
	});

	it('validates actionable catalog references while allowing retired forbidden-tool sentinels', () => {
		expect(() => assertAssistantCapabilityEvalCatalog(tools)).not.toThrow();
		expect(() =>
			assertAssistantCapabilityEvalCatalog(tools, [
				{
					...ASSISTANT_CAPABILITY_EVAL_CASES[0],
					requiredTools: ['retired_or_misspelled_tool']
				}
			])
		).toThrow(/retired_or_misspelled_tool/);
	});

	it('keeps a bilingual, cross-domain regression portfolio with explicit safety expectations', () => {
		const ids = new Set(ASSISTANT_CAPABILITY_EVAL_CASES.map((scenario) => scenario.id));
		const domains = new Set(ASSISTANT_CAPABILITY_EVAL_CASES.map((scenario) => scenario.domain));

		expect(ids.size).toBe(ASSISTANT_CAPABILITY_EVAL_CASES.length);
		expect(ASSISTANT_CAPABILITY_EVAL_CASES.length).toBeGreaterThanOrEqual(12);
		expect(domains).toEqual(
			new Set([
				'inventory',
				'planning',
				'recipes',
				'shopping',
				'cooking',
				'cross-domain',
				'knowledge'
			])
		);
		expect(ASSISTANT_CAPABILITY_EVAL_CASES.some((scenario) => scenario.locale === 'nl')).toBe(true);
		expect(
			ASSISTANT_CAPABILITY_EVAL_CASES.every(
				(scenario) =>
					scenario.requiredTools.length > 0 ||
					scenario.allowedFirstTools.length > 0 ||
					scenario.expectNoTool
			)
		).toBe(true);
		expect(
			ASSISTANT_CAPABILITY_EVAL_CASES.filter((scenario) => scenario.requiresReview).length
		).toBeGreaterThanOrEqual(4);
		expect(
			ASSISTANT_CAPABILITY_EVAL_CASES.filter((scenario) => scenario.knownBaselineFailure)
		).toHaveLength(0);
	});

	it('requires the reviewed Stock proposal for the former out-of-stock collision', () => {
		const scenario = ASSISTANT_CAPABILITY_EVAL_CASES.find(
			(candidate) => candidate.id === 'cross-domain-out-of'
		);

		expect(scenario).toBeDefined();
		expect(
			evaluateAssistantToolOrder(scenario!, ['get_inventory', 'prepare_stock_action'])
		).toBeNull();
	});

	it('routes the complete portfolio without exposing the broad fallback catalog', () => {
		let maximumRoutedToolCount = 0;
		let maximumRoutedToolBytes = 0;

		for (const scenario of ASSISTANT_CAPABILITY_EVAL_CASES) {
			const toolOrder: string[] = [];
			for (let iteration = 0; iteration < 8; iteration++) {
				const route = assistantToolRoute(scenario.prompt, false, [], toolOrder);
				const measurement = measureAssistantTools(route.tools);
				maximumRoutedToolCount = Math.max(maximumRoutedToolCount, measurement.count);
				maximumRoutedToolBytes = Math.max(maximumRoutedToolBytes, measurement.serializedBytes);

				if (!route.forcedToolName) {
					expect(route.tools, scenario.id).toHaveLength(0);
					break;
				}
				toolOrder.push(route.forcedToolName);
			}

			expect(evaluateAssistantToolOrder(scenario, toolOrder), scenario.id).toBeNull();
		}

		expect(maximumRoutedToolCount).toBeLessThanOrEqual(
			ASSISTANT_ROUTED_TOOL_BUDGET.maxCount
		);
		expect(maximumRoutedToolBytes).toBeLessThanOrEqual(
			ASSISTANT_ROUTED_TOOL_BUDGET.maxSerializedBytes
		);
	});
});
