import { describe, expect, it } from 'vitest';
import { displayQuantity } from './shared';

describe('inventory display quantity', () => {
	it('pluralizes portions in English and Dutch', () => {
		expect(displayQuantity(1, 'portion', 'en')).toBe('1 portion');
		expect(displayQuantity(2, 'portion', 'en')).toBe('2 portions');
		expect(displayQuantity(1, 'portion', 'nl')).toBe('1 portie');
		expect(displayQuantity(2, 'portion', 'nl')).toBe('2 porties');
	});

	it('localizes decimal values while preserving canonical units', () => {
		expect(displayQuantity(1.5, 'kg', 'en')).toBe('1.5 kg');
		expect(displayQuantity(1.5, 'kg', 'nl')).toBe('1,5 kg');
		expect(displayQuantity(2, 'stuk', 'nl')).toBe('2');
	});
});
