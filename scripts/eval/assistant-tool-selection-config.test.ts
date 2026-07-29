import { describe, expect, it } from 'vitest';
import { ASSISTANT_CAPABILITY_EVAL_CASES } from '../../src/lib/server/ai/assistant_capability_eval';
import {
	classifyAssistantEvalProviderFailure,
	resolveAssistantEvalCostBound,
	selectAssistantEvalCases
} from './assistant-tool-selection-config';

describe('Assistant live evaluator configuration', () => {
	it('keeps the full portfolio by default and supports an ordered compatibility subset', () => {
		expect(selectAssistantEvalCases(undefined, ASSISTANT_CAPABILITY_EVAL_CASES)).toEqual(
			ASSISTANT_CAPABILITY_EVAL_CASES
		);
		expect(
			selectAssistantEvalCases(
				'inventory-read-en,plain-cooking-knowledge',
				ASSISTANT_CAPABILITY_EVAL_CASES
			).map((scenario) => scenario.id)
		).toEqual(['inventory-read-en', 'plain-cooking-knowledge']);
	});

	it('fails closed for empty, duplicate, or unknown case filters', () => {
		expect(() => selectAssistantEvalCases(' ', ASSISTANT_CAPABILITY_EVAL_CASES)).toThrow(
			/empty/i
		);
		expect(() =>
			selectAssistantEvalCases(
				'inventory-read-en,inventory-read-en',
				ASSISTANT_CAPABILITY_EVAL_CASES
			)
		).toThrow(/duplicate/i);
		expect(() => selectAssistantEvalCases('not-a-case', ASSISTANT_CAPABILITY_EVAL_CASES)).toThrow(
			/unknown/i
		);
	});

	it('defaults to twenty-five cents and accepts a stricter positive cost bound', () => {
		expect(resolveAssistantEvalCostBound(undefined)).toBe(0.25);
		expect(resolveAssistantEvalCostBound('0.24')).toBe(0.24);
		expect(() => resolveAssistantEvalCostBound('0')).toThrow(/positive/i);
		expect(() => resolveAssistantEvalCostBound('not-money')).toThrow(/number/i);
	});

	it('classifies provider failures without retaining response details', () => {
		expect(
			classifyAssistantEvalProviderFailure(new Error('AI service error (401): sensitive detail'))
		).toBe('PROVIDER_AUTH_FAILED');
		expect(
			classifyAssistantEvalProviderFailure(new Error('AI service error (402): sensitive detail'))
		).toBe('PROVIDER_CREDIT_BLOCKED');
		expect(
			classifyAssistantEvalProviderFailure(
				new Error('AI service error (403): key limit exceeded')
			)
		).toBe('PROVIDER_CREDIT_BLOCKED');
		expect(
			classifyAssistantEvalProviderFailure(new Error('AI service error (403): forbidden'))
		).toBe('PROVIDER_FORBIDDEN');
		expect(
			classifyAssistantEvalProviderFailure(new Error('AI service error (429): sensitive detail'))
		).toBe('PROVIDER_RATE_LIMITED');
		expect(
			classifyAssistantEvalProviderFailure(new Error('AI service error (503): sensitive detail'))
		).toBe('PROVIDER_SERVER_ERROR');
		expect(classifyAssistantEvalProviderFailure(new Error('socket closed'))).toBe(
			'PROVIDER_CALL_FAILED'
		);
	});
});
