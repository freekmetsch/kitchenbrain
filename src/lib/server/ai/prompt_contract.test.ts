import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const systemPrompt = readFileSync('src/lib/server/ai/prompts/system.md', 'utf8');

describe('assistant system prompt contracts', () => {
	it('stages one complete recipe proposal instead of stacking duplicate cards', () => {
		expect(systemPrompt).toContain('One complete recipe proposal per turn');
		expect(systemPrompt).toContain('After it returns a successful staged proposal, do not call it again in that turn');
	});

	it('keeps three different forms in the immediately visible candidate positions', () => {
		expect(systemPrompt).toContain(
			'Assign one canonical purchase-form label regardless of brand, size, cultivar, or marketing wording'
		);
		expect(systemPrompt).toContain(
			'The first three candidates are visible immediately and must have three different product forms'
		);
		expect(systemPrompt).toContain('put extra brands, sizes, or variants only in positions 4–9');
		expect(systemPrompt).toContain(
			'When the user asks for choices and current evidence contains three valid forms, stage the proposal'
		);
		expect(systemPrompt).toContain('If fewer than three valid forms are evidenced, do not fake a group');
	});

	it('is assertive inside a requested household outcome without becoming autonomous', () => {
		expect(systemPrompt).toContain('Assertive preparation, not autonomous initiation');
		expect(systemPrompt).toContain(
			'Do not ask whether you should perform a safe read, comparison, Shopping reconciliation, or read-only AH preview'
		);
		expect(systemPrompt).toContain(
			'Never start household work merely because the app opened'
		);
		expect(systemPrompt).toContain(
			'Use `propose_meal_plan` instead of direct meal-plan writes'
		);
	});

	it('keeps presentation bespoke and process narration out of the model toolset', () => {
		expect(systemPrompt).not.toContain('`present_plan`');
		expect(systemPrompt).toContain(
			'Include only decision-useful recommendation context supported by the reads you performed'
		);
		expect(systemPrompt).toContain('Omit a recommendation field rather than inventing content');
	});
});
