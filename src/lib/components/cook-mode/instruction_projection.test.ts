import { describe, expect, it } from 'vitest';
import { projectInstruction, projectSentence, splitSentences } from './instruction_projection';

describe('instruction projection', () => {
	it('splits display lines without changing the source text', () => {
		const source = 'Heat the pan. Add onion! Rest? Then serve';
		expect(splitSentences(source)).toEqual(['Heat the pan. ', 'Add onion! ', 'Rest? ', 'Then serve']);
		expect(splitSentences(source).join('')).toBe(source);
	});

	it('handles sentence punctuation without following spaces', () => {
		const source = 'Chop onion.Fry onion.Serve.';
		expect(splitSentences(source)).toEqual(['Chop onion.', 'Fry onion.', 'Serve.']);
	});

	it('bolds the first imperative word without changing the instruction', () => {
		expect(projectSentence('Bak de ui goudbruin.')).toEqual([
			{ kind: 'action', text: 'Bak' },
			{ kind: 'text', text: ' de ui goudbruin.' }
		]);
	});

	it('keeps sequencing words plain and bolds the action that follows', () => {
		expect(projectSentence('Meanwhile, heat the oven.')).toEqual([
			{ kind: 'text', text: 'Meanwhile, ' },
			{ kind: 'action', text: 'heat' },
			{ kind: 'text', text: ' the oven.' }
		]);
		expect(projectSentence('Daarna voeg je de tomaten toe.')).toEqual([
			{ kind: 'text', text: 'Daarna ' },
			{ kind: 'action', text: 'voeg' },
			{ kind: 'text', text: ' je de tomaten toe.' }
		]);
	});

	it('projects every sentence and preserves every source character', () => {
		const source = 'Add crème fraîche. Vervolgens roer je de ui erdoor.';
		const lines = projectInstruction(source);
		expect(lines.flatMap((line) => line.segments).map((segment) => segment.text).join('')).toBe(source);
		expect(lines.map((line) => line.segments.find((segment) => segment.kind === 'action')?.text)).toEqual([
			'Add',
			'roer'
		]);
	});
});
