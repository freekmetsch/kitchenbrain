import { describe, expect, it } from 'vitest';
import { violatesCookModeBody } from './cook_mode';

describe('cook-mode body limits', () => {
	it('accepts up to two concise sentences', () => {
		expect(violatesCookModeBody('Add the onion. Stir until soft.')).toBeNull();
		expect(violatesCookModeBody('Voeg de ui toe en bak zacht')).toBeNull();
	});

	it('rejects a third sentence and more than 28 words', () => {
		expect(violatesCookModeBody('Add onion. Stir well. Lower the heat.')).toContain('≤ 2 sentences');
		expect(violatesCookModeBody('Add onion.Stir well.Lower the heat.')).toContain('≤ 2 sentences');
		expect(violatesCookModeBody(Array.from({ length: 29 }, () => 'word').join(' '))).toContain('≤ 28 words');
	});
});
