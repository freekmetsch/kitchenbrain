import { describe, expect, it } from 'vitest';
import { tools } from './tools';
import {
	ASSISTANT_CAPABILITY_EVAL_CASES,
	ASSISTANT_TOOL_BUDGET,
	assertAssistantToolBudget,
	evaluateAssistantToolOrder,
	measureAssistantTools
} from './assistant_capability_eval';

describe('Assistant capability quality gate', () => {
	it('keeps the complete shipped surface inside the checked exposure budget', () => {
		const measurement = measureAssistantTools(tools);

		expect(measurement.count).toBe(27);
		expect(measurement.serializedBytes).toBe(24_302);
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

	it('keeps a bilingual, cross-domain regression portfolio with explicit safety expectations', () => {
		const ids = new Set(ASSISTANT_CAPABILITY_EVAL_CASES.map((scenario) => scenario.id));
		const domains = new Set(ASSISTANT_CAPABILITY_EVAL_CASES.map((scenario) => scenario.domain));

		expect(ids.size).toBe(ASSISTANT_CAPABILITY_EVAL_CASES.length);
		expect(ASSISTANT_CAPABILITY_EVAL_CASES.length).toBeGreaterThanOrEqual(12);
		expect(domains).toEqual(
			new Set(['inventory', 'planning', 'recipes', 'shopping', 'cross-domain', 'knowledge'])
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
});
