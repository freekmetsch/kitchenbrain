import { describe, expect, it } from 'vitest';
import type { CookModeDisplayRecipe } from '$lib/types';
import { decodeCookSession, migrateLegacyCookSession } from './cook_session';

const plan: CookModeDisplayRecipe = {
	version: 5,
	language: 'nl',
	generation_id: 'g1',
	servings: 4,
	mise_en_place: [],
	streams: [{ id: 'main', name: 'Hoofd' }],
	steps: [
		{
			step_id: 'step-1',
			direction_id: 'dir-1',
			title: 'Snijd.',
			goal: 'Snijd.',
			body: 'Snijd.',
			ingredients: [],
			timer_seconds: null,
			timer_purpose: null,
			timer_action: null,
			timer_location: null,
			stream_id: 'main',
			merges_from: []
		}
	]
};
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
	it('accepts only the versioned frozen-plan payload', () => {
		expect(
			decodeCookSession({
				v: 2,
				sig: 'g1',
				currentStepKey: 'step-1',
				timerEnds: {},
				timerOrder: [],
				servings: 6,
				frozenRecipe
			})
		).toMatchObject({ v: 2, sig: 'g1', servings: 6 });
		expect(decodeCookSession({ v: 1, sig: 'g1' })).toBeNull();
	});

	it('migrates only legacy progress that represents a started session', () => {
		expect(
			migrateLegacyCookSession(
				{ sig: 'g1', currentStepKey: 'step-1', timerEnds: {}, timerOrder: [] },
				plan,
				'g1',
				frozenRecipe
			)
		).toBeNull();
		expect(
			migrateLegacyCookSession(
				{ sig: 'g1', currentStepKey: '1:main', timerEnds: {}, timerOrder: [] },
				plan,
				'g1',
				frozenRecipe
			)?.frozenRecipe
		).toEqual(frozenRecipe);
	});
});
