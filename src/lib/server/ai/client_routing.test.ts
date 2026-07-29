import { describe, expect, it } from 'vitest';
import { backendFor } from './client';

describe('AI provider routing', () => {
	it('keeps OpenRouter namespace ids on OpenRouter regardless of vendor', () => {
		expect(backendFor('anthropic/claude-haiku-4.5')).toBe('openrouter');
		expect(backendFor('openai/gpt-5-mini')).toBe('openrouter');
		expect(backendFor('google/gemini-2.5-flash')).toBe('openrouter');
		expect(backendFor('z-ai/glm-5')).toBe('openrouter');
	});

	it('retains bare Claude ids as the dormant native Anthropic rollback', () => {
		expect(backendFor('claude-sonnet-4-6')).toBe('anthropic');
	});
});
