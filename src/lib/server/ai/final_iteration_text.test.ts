import { describe, expect, it } from 'vitest';
import { FinalIterationText, finalizeProposalText } from './final_iteration_text';

describe('FinalIterationText', () => {
	it('discards tool-iteration prose and exposes only the final assistant iteration', () => {
		const buffer = new FinalIterationText();

		buffer.append('I will inspect the recipe.');
		expect(buffer.complete(1)).toEqual({ done: false, text: '' });

		buffer.append('I found products and will compare them.');
		expect(buffer.complete(2)).toEqual({ done: false, text: '' });

		buffer.append('Choose one option for each ingredient.');
		expect(buffer.complete(0)).toEqual({
			done: true,
			text: 'Choose one option for each ingredient.'
		});
	});

	it('clears discarded text before the next iteration', () => {
		const buffer = new FinalIterationText();
		buffer.append('working');
		buffer.complete(1);
		buffer.append('final');

		expect(buffer.complete(0)).toEqual({ done: true, text: 'final' });
	});
});

describe('finalizeProposalText', () => {
	const fallback = 'The review is ready above.';

	it('keeps one concise final sentence', () => {
		expect(finalizeProposalText('The three choices are ready to review.', fallback)).toBe(
			'The three choices are ready to review.'
		);
	});

	it('replaces overlong proposal narration', () => {
		expect(finalizeProposalText('x'.repeat(181), fallback)).toBe(fallback);
	});

	it('replaces multi-line proposal narration', () => {
		expect(finalizeProposalText('First line.\nSecond line.', fallback)).toBe(fallback);
	});
});
