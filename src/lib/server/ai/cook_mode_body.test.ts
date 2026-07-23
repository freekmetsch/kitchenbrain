import { describe, expect, it } from 'vitest';
import { violatesCookModeBody } from './cook_mode';

describe('cook-mode body limits', () => {
	it('accepts up to three concise sentences', () => {
		expect(violatesCookModeBody('Add the onion. Stir until soft.')).toBeNull();
		expect(violatesCookModeBody('Add the onion. Stir until soft. Lower the heat.')).toBeNull();
		expect(violatesCookModeBody('Voeg de ui toe en bak zacht')).toBeNull();
	});

	it('rejects a fourth sentence and more than 36 words', () => {
		expect(violatesCookModeBody('Add onion. Stir well. Lower the heat. Cover the pan.')).toContain('≤ 3 sentences');
		expect(violatesCookModeBody('Add onion.Stir well.Lower the heat.Cover the pan.')).toContain('≤ 3 sentences');
		expect(violatesCookModeBody(Array.from({ length: 37 }, () => 'word').join(' '))).toContain('≤ 36 words');
	});
});
