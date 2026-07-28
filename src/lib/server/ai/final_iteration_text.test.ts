import { describe, expect, it } from 'vitest';
import { FinalIterationText } from './final_iteration_text';

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
