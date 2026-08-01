import { describe, expect, it } from 'vitest';
import { readCookSession, restoredCookSessionServings } from './cook_session';
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
	it('keeps server-provided planned servings authoritative over a stored cooking session', () => {
		expect(restoredCookSessionServings(9, 4)).toBe(4);
		expect(restoredCookSessionServings(9, null)).toBe(9);
	});

	it('accepts only a frozen-plan payload that records its display language', () => {
		expect(
			readCookSession({
				v: 5,
				sig: 'g1',
				frozenViewLang: 'nl',
				currentStepKey: 'step-1',
				servings: 6,
				frozenRecipe,
				counterChecks: { ui: true },
				sessionSwaps: {}
			})
		).toMatchObject({
			state: 'ready',
			session: {
				v: 5,
				sig: 'g1',
				frozenViewLang: 'nl',
				servings: 6
			}
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
				frozenRecipe
			})
		).toEqual({ state: 'discard' });
	});

	it('forwards the previous session version while preserving surviving progress', () => {
		expect(
			readCookSession({
				v: 4,
				sig: 'g1',
				frozenViewLang: 'nl',
				currentStepKey: 'step-1',
				servings: 7,
				frozenRecipe,
				counterChecks: { ui: true },
				sessionSwaps: {
					ui: { substituteIndex: 0, displayName: 'sjalot', canonicalName: 'sjalot' }
				},
				obsoletePayload: { 1: 'ignored' }
			})
		).toMatchObject({
			state: 'ready',
			session: {
				v: 5,
				currentStepKey: 'step-1',
				servings: 7,
				counterChecks: { ui: true },
				sessionSwaps: {
					ui: { substituteIndex: 0, displayName: 'sjalot', canonicalName: 'sjalot' }
				}
			}
		});
	});
});
