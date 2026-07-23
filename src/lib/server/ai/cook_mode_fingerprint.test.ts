import { describe, expect, it } from 'vitest';
import { generationFingerprint, validateGeneratedCookMode } from './cook_mode';

function recipe(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		title: 'Soep',
		language: 'nl',
		servings: 4,
		totalTimeMin: 30,
		ingredients: [{ name: 'ui', amount: '1' }],
		directions: ['Bak de ui.'],
		...overrides
	} as never;
}

describe('cook-mode semantic fingerprint', () => {
	it('ignores presentation and planning fields', () => {
		const before = generationFingerprint(recipe(), []);
		expect(generationFingerprint(recipe({ totalTimeMin: 90, rating: 5, imageUrl: '/new.webp' }), [])).toBe(before);
	});

	it('changes for canonical cooking content and component content', () => {
		const before = generationFingerprint(recipe(), [recipe({ id: 2, title: 'Saus' })]);
		expect(generationFingerprint(recipe({ directions: ['Kook de ui.'] }), [recipe({ id: 2, title: 'Saus' })])).not.toBe(before);
		expect(generationFingerprint(recipe(), [recipe({ id: 2, title: 'Saus', ingredients: [{ name: 'knoflook', amount: '1' }] })])).not.toBe(before);
	});
});

describe('generated v5 cooking structure', () => {
	const valid = {
		version: 5,
		instructions: [
			{ direction_id: 'dir-1', text: { en: 'Cut the onion.', nl: 'Snijd de ui.' } }
		],
		streams: [{ id: 'main', name: { en: 'Main pan', nl: 'Hoofdpan' } }],
		steps: [
			{
				step_id: 'step-1',
				direction_id: 'dir-1',
				ingredient_uses: [{ ingredient_id: 'ui', allocation: { kind: 'all' } }],
				timer_seconds: null,
				timer_purpose: null,
				timer_action: null,
				timer_location: null,
				stream_id: 'main',
				merges_from: []
			}
		]
	};

	it('accepts stable direction and ingredient references', () => {
		expect(validateGeneratedCookMode(valid, ['dir-1'], ['ui']).success).toBe(true);
	});

	it('rejects missing directions and invented ingredient IDs', () => {
		const invalid = structuredClone(valid);
		invalid.steps[0].ingredient_uses[0].ingredient_id = 'invented';
		expect(validateGeneratedCookMode(invalid, ['dir-1'], ['ui']).success).toBe(false);
		expect(validateGeneratedCookMode(valid, ['dir-1', 'dir-2'], ['ui']).success).toBe(false);
	});
});
