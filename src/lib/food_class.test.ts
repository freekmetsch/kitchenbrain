import { describe, expect, it } from 'vitest';
import { inferFoodClassFromName, isUnclassified } from './food_class';

describe('inferFoodClassFromName', () => {
	it('maps known Dutch specific-class tokens via substring match', () => {
		expect(inferFoodClassFromName('kipfilet')).toBe('chicken');
		expect(inferFoodClassFromName('Rundergehakt')).toBe('beef');
		expect(inferFoodClassFromName('varkenshaas')).toBe('pork');
		expect(inferFoodClassFromName('lamsbout')).toBe('lamb');
	});

	it('maps core-class tokens, longest token winning', () => {
		expect(inferFoodClassFromName('verse vis')).toBe('fish');
		expect(inferFoodClassFromName('vleeswaren')).toBe('meat');
		// "rundvlees" contains both "rund" and "vlees"; the longer specific
		// token must win over the broader core class.
		expect(inferFoodClassFromName('rundvlees')).toBe('beef');
	});

	it('stays null for names without a known token', () => {
		// "gehakt" is deliberately NOT a token — ambiguous names are the AI
		// guardian's job, not this conservative matcher's.
		expect(inferFoodClassFromName('gemengd gehakt')).toBeNull();
		expect(inferFoodClassFromName('bloem')).toBeNull();
		expect(inferFoodClassFromName('')).toBeNull();
		// Per-word match: a class token mid-word must NOT hit ("lam" inside
		// "vlammetjes" is a snack, not lamb).
		expect(inferFoodClassFromName('vlammetjes')).toBeNull();
	});
});

describe('isUnclassified', () => {
	it('mirrors the audit definition (scripts/audit_taxonomy.ts)', () => {
		expect(isUnclassified(null, null)).toBe(true);
		expect(isUnclassified(null, 'chicken')).toBe(true);
		expect(isUnclassified('ingredient', null)).toBe(true);
		expect(isUnclassified('ingredient', 'chicken')).toBe(false);
		expect(isUnclassified('leftover', null)).toBe(true);
		// Processed items carry no food-class requirement.
		expect(isUnclassified('processed', null)).toBe(false);
	});
});
