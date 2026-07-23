import { describe, expect, it } from 'vitest';
import type {
	CookModeRecipe,
	LocalizedCookModeRecipe,
	LocalizedCookModeRecipeV4,
	LocalizedCookModeRecipeV5
} from '$lib/types';
import {
	hasCookModeLanguage,
	isCookModeEligibleForNewSession,
	isStaleCookMode,
	localizeCookMode
} from './staleness';

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

const structured: LocalizedCookModeRecipeV4 = {
	version: 4,
	generation_id: 'generation-4',
	baseline_servings: 4,
	prep_tasks: [{ text: { en: 'Chop the onion', nl: 'Snijd de ui' }, ingredient_indexes: [0] }],
	streams: [{ id: 'pot', name: { en: 'Main pan', nl: 'Hoofdpan' } }],
	steps: [{
		title: { en: 'Cook the onion', nl: 'Bak de ui' },
		goal: { en: 'Cook onion — soft and golden', nl: 'Bak ui — zacht en goudbruin' },
		body: { en: 'Cook over medium heat.', nl: 'Bak op middelhoog vuur.' },
		ingredient_indexes: [0],
		timer_seconds: null,
		timer_purpose: null,
		timer_action: null,
		timer_location: null,
		stream_id: 'pot',
		merges_from: []
	}]
};

const semantic: LocalizedCookModeRecipeV5 = {
	version: 5,
	generation_id: 'generation-5',
	baseline_servings: 4,
	content_revision: 3,
	structure_fingerprint: 'fingerprint',
	streams: [
		{ id: 'base', name: { en: 'Base', nl: 'Bodem' } },
		{ id: 'cake', name: { en: 'Cake', nl: 'Taart' } }
	],
	steps: [
		{
			step_id: 'step-a',
			direction_id: 'dir-a',
			stream_id: 'base',
			merges_from: [],
			ingredient_uses: [
				{ ingredient_id: 'flour', allocation: { kind: 'fraction', numerator: 1, denominator: 2 } }
			],
			timer_seconds: null,
			timer_purpose: null,
			timer_action: null,
			timer_location: null
		},
		{
			step_id: 'step-b',
			direction_id: 'dir-b',
			stream_id: 'cake',
			merges_from: ['base'],
			ingredient_uses: [{ ingredient_id: 'flour', allocation: { kind: 'remaining' } }],
			timer_seconds: null,
			timer_purpose: null,
			timer_action: null,
			timer_location: null
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

	it('starts the Kitchen Timeline only from structured v4 or v5 caches', () => {
		expect(isCookModeEligibleForNewSession(current, 'en', 4)).toBe(false);
		expect(isCookModeEligibleForNewSession(bilingual, 'nl', 4)).toBe(false);
		expect(isCookModeEligibleForNewSession(structured, 'nl', 99)).toBe(true);
		expect(isCookModeEligibleForNewSession(semantic, 'en', 6)).toBe(true);
	});

	it('rejects malformed localized leaves', () => {
		const malformed = structuredClone(bilingual);
		malformed.steps[0].goal.nl = 'ui zacht';
		expect(isStaleCookMode(malformed)).toBe(true);
	});

	it('projects v4 ingredient references instantly for a new serving target', () => {
		expect(isStaleCookMode(structured)).toBe(false);
		expect(hasCookModeLanguage(structured, 'nl', 99)).toBe(true);
		const display = localizeCookMode(structured, 'nl', {
			ingredients: [{ name: 'ui', amount: '2', scale: 'whole' }],
			baselineServings: 4,
			targetServings: 6
		});
		expect(display?.version).toBe(4);
		expect(display?.steps[0].ingredients).toEqual(['3 ui']);
		expect(display?.generation_id).toBe('generation-4');
	});

	it('regenerates only prep caches that combine several ingredients in one checkbox', () => {
		const multiple = structuredClone(structured);
		multiple.prep_tasks[0].ingredient_indexes = [0, 1];
		expect(isStaleCookMode(multiple)).toBe(true);

		const none = structuredClone(structured);
		none.prep_tasks[0].ingredient_indexes = [];
		expect(isStaleCookMode(none)).toBe(false);
		expect(localizeCookMode(none, 'en')?.prep_tasks?.[0].ingredient_index).toBeNull();
	});

	it('projects v5 directions and exact allocated amounts from stable IDs', () => {
		expect(isStaleCookMode(semantic)).toBe(false);
		const display = localizeCookMode(semantic, 'nl', {
			ingredients: [{ id: 'flour', name: 'bloem', amount: '400', unit: 'g' }],
			baselineServings: 4,
			targetServings: 6,
			directions: ['Meng de bloem.', 'Voeg de rest toe.'],
			directionIds: ['dir-a', 'dir-b']
		});
		expect(display?.steps.map((step) => step.body)).toEqual([
			'Meng de bloem.',
			'Voeg de rest toe.'
		]);
		expect(display?.steps.map((step) => step.ingredients)).toEqual([
			['300 g bloem'],
			['300 g bloem']
		]);
	});

	it('rejects impossible v5 allocations', () => {
		const tooMuch = structuredClone(semantic);
		tooMuch.steps[0].ingredient_uses[0].allocation = {
			kind: 'fraction',
			numerator: 3,
			denominator: 2
		};
		expect(isStaleCookMode(tooMuch)).toBe(true);

		const afterRemaining = structuredClone(semantic);
		afterRemaining.steps.push({
			...afterRemaining.steps[0],
			step_id: 'step-c',
			direction_id: 'dir-c'
		});
		expect(isStaleCookMode(afterRemaining)).toBe(true);
	});
});
