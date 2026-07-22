import { describe, expect, it } from 'vitest';
import { projectBody, projectGoal, segmentIngredients, splitSentences } from './instruction_projection';

describe('instruction projection', () => {
	it('keeps every source character across sentence lines', () => {
		const source = 'Cut the onion. Then fry it! Keep stirring? Done';
		expect(splitSentences(source).join('')).toBe(source);
		expect(projectBody(source, ['onion']).flatMap((line) => line.segments).map((part) => part.text).join('')).toBe(source);
	});

	it('keeps instructions when sentence punctuation has no following space', () => {
		const source = 'Chop onion.Fry onion.Serve.';
		expect(splitSentences(source)).toEqual(['Chop onion.', 'Fry onion.', 'Serve.']);
		expect(splitSentences(source).join('')).toBe(source);
	});

	it('leaves one long sentence intact', () => {
		expect(splitSentences('Cook until the sauce coats the spoon')).toEqual(['Cook until the sauce coats the spoon']);
	});

	it('marks exact Unicode ingredient names longest-first without overlap', () => {
		const source = 'Bak de rode ui met ui; houd de kruidenmix heel.';
		const projected = segmentIngredients(source, ['ui', 'rode ui', 'kruidenmix']);
		expect(projected.filter((part) => part.kind === 'ingredient').map((part) => part.text)).toEqual(['rode ui', 'ui', 'kruidenmix']);
		expect(projected.map((part) => part.text).join('')).toBe(source);
		expect(segmentIngredients('fruitig', ['ui']).some((part) => part.kind === 'ingredient')).toBe(false);
	});

	it('marks only the validated goal cue as the action', () => {
		expect(projectGoal('Cook onion — soft and golden')).toEqual([
			{ kind: 'action', text: 'Cook onion' },
			{ kind: 'text', text: ' — soft and golden' }
		]);
		expect(projectGoal('Plain fallback')).toEqual([{ kind: 'text', text: 'Plain fallback' }]);
	});
});
