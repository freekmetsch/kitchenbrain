import { describe, expect, it } from 'vitest';
import { projectRotationSource } from './meal_rotation_source';

describe('projectRotationSource', () => {
	it('recommends Cook when keep-stocked freezer portions are below target', () => {
		expect(
			projectRotationSource({
				isFreezerStaple: true,
				targetPortions: 6,
				onHandPortions: 2,
				servings: 4
			})
		).toEqual({
			action: 'cook',
			mealSource: 'fresh',
			servings: 4,
			freezerLow: true,
			reason: 'below_target'
		});
	});

	it('recommends Use freezer when the configured target is met', () => {
		expect(
			projectRotationSource({
				isFreezerStaple: true,
				targetPortions: 4,
				onHandPortions: 4,
				servings: 2
			})
		).toMatchObject({
			action: 'use_freezer',
			mealSource: 'freezer',
			servings: 4,
			freezerLow: false,
			reason: 'stock_available'
		});
	});

	it('uses linked freezer stock even when no keep-stocked target is configured', () => {
		expect(
			projectRotationSource({
				isFreezerStaple: false,
				targetPortions: null,
				onHandPortions: 3,
				servings: 2
			})
		).toMatchObject({ action: 'use_freezer', mealSource: 'freezer', servings: 3 });
	});

	it('recommends Cook when no linked portions are available', () => {
		expect(
			projectRotationSource({
				isFreezerStaple: false,
				targetPortions: null,
				onHandPortions: 0,
				servings: 5
			})
		).toMatchObject({ action: 'cook', mealSource: 'fresh', servings: 5 });
	});

	it('does not put recipes without a serving baseline in the Freezer low lane', () => {
		expect(
			projectRotationSource({
				isFreezerStaple: true,
				targetPortions: 4,
				onHandPortions: 0,
				servings: null
			})
		).toMatchObject({ action: 'cook', mealSource: 'fresh', servings: null, freezerLow: false });
	});
});
