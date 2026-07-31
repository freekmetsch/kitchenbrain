import { describe, expect, it } from 'vitest';
import { parseRecipeRhythmResponse, recipeRhythmPayload } from './recipe_rhythm';

describe('recipe rhythm client contract', () => {
	it('builds one atomic rhythm and freezer payload', () => {
		expect(recipeRhythmPayload('seasonal', ['winter', 'autumn'], true, 6)).toEqual({
			rotation_policy: 'seasonal',
			rotation_seasons: ['autumn', 'winter'],
			is_freezer_staple: true,
			target_portions: 6
		});
	});

	it('accepts only a complete canonical response', () => {
		expect(
			parseRecipeRhythmResponse({
				rotationPolicy: 'monthly',
				rotationSeasons: ['winter'],
				isFreezerStaple: false,
				targetPortions: null
			})
		).toEqual({
			rotationPolicy: 'monthly',
			rotationSeasons: ['winter'],
			isFreezerStaple: false,
			targetPortions: null
		});
		expect(parseRecipeRhythmResponse({ rotationPolicy: 'monthly' })).toBeNull();
	});
});
