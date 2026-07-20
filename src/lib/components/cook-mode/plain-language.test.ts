import { describe, expect, it } from 'vitest';
import { inaccessibleCookModeTerm } from './plain-language';

describe('cooking-view language', () => {
	it.each([
		'Build the sofrito',
		'Chop aromatics',
		'Bloom the spices',
		'Sweat the onions',
		'Mount the sauce'
	])('rejects restaurant shorthand: %s', (value) => {
		expect(inaccessibleCookModeTerm(value)).not.toBeNull();
	});

	it.each([
		'Cook the onion, carrot and celery',
		'Cook spices until fragrant',
		'Bak de ui tot hij zacht is',
		'Roer de koude boter door de saus'
	])('accepts concrete home-cook wording: %s', (value) => {
		expect(inaccessibleCookModeTerm(value)).toBeNull();
	});
});
