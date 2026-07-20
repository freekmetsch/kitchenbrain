import { describe, expect, it } from 'vitest';
import type { CookModeRecipe, LocalizedCookModeRecipe } from '$lib/types';
import { hasCookModeLanguage, isStaleCookMode, localizeCookMode } from './staleness';

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

const bilingual: LocalizedCookModeRecipe = {
	version: 3,
	generation_id: 'generation-1',
	servings: 4,
	mise_en_place: [{ en: 'Chop the onion', nl: 'Snijd de ui' }],
	streams: [{ id: 'pot', name: { en: 'Main pan', nl: 'Hoofdpan' } }],
	steps: [
		{
			title: { en: 'Cook the onion', nl: 'Bak de ui' },
			goal: { en: 'Cook onion — soft and golden', nl: 'Bak ui — zacht en goudbruin' },
			body: { en: 'Cook over medium heat.', nl: 'Bak op middelhoog vuur.' },
			ingredients: [{ en: '1 onion', nl: '1 ui' }],
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

	it('accepts one shared bilingual graph and projects either language', () => {
		expect(isStaleCookMode(bilingual)).toBe(false);
		expect(hasCookModeLanguage(bilingual, 'en', 4)).toBe(true);
		expect(hasCookModeLanguage(bilingual, 'nl', 4)).toBe(true);
		expect(hasCookModeLanguage(bilingual, 'nl', 6)).toBe(false);
		expect(localizeCookMode(bilingual, 'nl')?.steps[0].title).toBe('Bak de ui');
		expect(localizeCookMode(bilingual, 'en')?.generation_id).toBe('generation-1');
	});

	it('keeps v2 English-capable but does not pretend it contains Dutch', () => {
		expect(hasCookModeLanguage(current, 'en', 4)).toBe(true);
		expect(hasCookModeLanguage(current, 'nl', 4)).toBe(false);
		expect(localizeCookMode(current, 'nl')).toBeNull();
	});

	it('rejects malformed localized leaves', () => {
		const malformed = structuredClone(bilingual);
		malformed.steps[0].goal.nl = 'ui zacht';
		expect(isStaleCookMode(malformed)).toBe(true);
	});
});
