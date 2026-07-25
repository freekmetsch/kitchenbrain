import { describe, expect, it } from 'vitest';
import {
	ALL_PROMPT_STARTER_IDS,
	promptStarterDraft,
	promptStarterIds,
	promptStarterText
} from './prompt_starters';

describe('main assistant prompt starters', () => {
	it('offers only the three general starters', () => {
		expect(promptStarterIds()).toEqual(['generalCook', 'generalPlan', 'generalShop']);
	});

	it('keeps every starter incomplete and turns it into an editable draft', () => {
		for (const id of ALL_PROMPT_STARTER_IDS) {
			const text = promptStarterText(id);
			const draft = promptStarterDraft(text);

			expect(text.length).toBeGreaterThan(3);
			expect(text).not.toMatch(/[.!?…]$/);
			expect(draft).toBe(`${text} `);
		}
	});
});
