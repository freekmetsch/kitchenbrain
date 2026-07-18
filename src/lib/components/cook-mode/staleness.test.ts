import { describe, expect, it } from 'vitest';
import type { CookModeRecipe } from '$lib/types';
import { isStaleCookMode } from './staleness';

const current: CookModeRecipe = {
	version: 2,
	language: 'en',
	mise_en_place: ['1 onion, chopped'],
	streams: [{ id: 'pot', name: 'Pot' }],
	steps: [
		{
			title: 'Sweat onion',
			goal: 'Sweat onion — translucent',
			body: 'Cook the onion until translucent.',
			ingredients: ['1 onion'],
			timer_seconds: null,
			timer_purpose: null,
			timer_action: null,
			timer_location: null,
			stream_id: 'pot',
			merges_from: []
		}
	]
};

describe('cook-mode cache versioning', () => {
	it('accepts the current all-English cache contract', () => {
		expect(isStaleCookMode(current)).toBe(false);
	});

	it('regenerates legacy caches that have no explicit version or language', () => {
		const legacy = { ...current, version: undefined, language: undefined };
		expect(isStaleCookMode(legacy)).toBe(true);
	});
});
