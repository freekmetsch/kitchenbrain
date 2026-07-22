import { describe, expect, it } from 'vitest';
import { packQuantitySchema } from './shopping_ah';

describe('AH pack quantity contract', () => {
	it.each([1, 2, 99])('accepts %s packs', (qty) => {
		expect(packQuantitySchema.safeParse(qty).success).toBe(true);
	});

	it.each([0, 100, 1.5, Number.NaN, '2'])('rejects unsafe quantity %s', (qty) => {
		expect(packQuantitySchema.safeParse(qty).success).toBe(false);
	});
});
