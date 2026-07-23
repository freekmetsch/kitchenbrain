import { describe, expect, it } from 'vitest';
import { readCookSession } from './cook_session';
const frozenRecipe = {
	signature: 'g1',
	storedCookMode: null,
	directions: ['Snijd.'],
	directionIds: ['dir-1'],
	ingredients: [],
	canonicalIngredients: [],
	baselineServings: 4
};

describe('cook session persistence', () => {
	it('accepts only a frozen-plan payload that records its display language', () => {
		expect(
			readCookSession({
				v: 3,
				sig: 'g1',
				frozenViewLang: 'nl',
				currentStepKey: 'step-1',
				timerEnds: {},
				timerOrder: [],
				servings: 6,
				frozenRecipe
			})
		).toMatchObject({
			state: 'ready',
			session: { v: 3, sig: 'g1', frozenViewLang: 'nl', servings: 6 }
		});
		expect(readCookSession({ v: 2, sig: 'g1', frozenRecipe })).toEqual({
			state: 'discard'
		});
	});

	it('discards pre-language session payloads instead of partially remapping them', () => {
		expect(
			readCookSession({
				sig: 'g1',
				currentStepKey: '1:main',
				timerEnds: { 1: Date.now() + 60_000 },
				timerOrder: [1],
				frozenRecipe
			})
		).toEqual({ state: 'discard' });
	});

	it('discards a versioned session whose timer state is incomplete', () => {
		expect(
			readCookSession({
				v: 3,
				sig: 'g1',
				frozenViewLang: 'nl',
				currentStepKey: 'step-1',
				timerEnds: { 1: 'later' },
				timerOrder: [1],
				servings: 4,
				frozenRecipe
			})
		).toEqual({ state: 'discard' });
	});
});
