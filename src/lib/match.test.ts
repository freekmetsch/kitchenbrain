import { describe, expect, it } from 'vitest';
import { namesMatch, titlesMatch } from './match';

describe('titlesMatch', () => {
	it('rejects names that only share one generic token', () => {
		// UX-STOCK-3: "katsu curry" must not suggest "chickpea spinach curry".
		expect(titlesMatch('katsu curry', 'kikkererwten spinazie curry')).toBe(false);
		expect(titlesMatch('katsu curry', 'chickpea spinach curry')).toBe(false);
	});

	it('accepts when the shorter name is a token subset of the longer', () => {
		expect(titlesMatch('chili', 'chili con carne')).toBe(true);
		expect(titlesMatch('katsu curry', 'kip katsu curry')).toBe(true);
	});

	it('matches identical names and survives stemming/diacritics', () => {
		expect(titlesMatch('hachee', 'Hachee')).toBe(true);
		expect(titlesMatch('boerenkool stamppot', 'Boerenkoolstamppot')).toBe(true);
	});

	it('rejects unrelated names', () => {
		expect(titlesMatch('harira', 'lasagne')).toBe(false);
	});
});

describe('namesMatch (ingredient matching, unchanged)', () => {
	it('still matches on any shared token', () => {
		expect(namesMatch('rode ui', 'ui')).toBe(true);
		expect(namesMatch('chilipeper', 'chili')).toBe(true);
	});
});
