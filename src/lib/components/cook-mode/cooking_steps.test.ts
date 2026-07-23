import { describe, expect, it } from 'vitest';
import type { CookModeDisplayRecipe } from '$lib/types';
import { cookingStepsFromDirections, preparationAsFirstStep } from './cooking_steps';

describe('deterministic cooking steps', () => {
	it('projects every saved direction once and in order', () => {
		const directions = ['Snijd de ui.', 'Bak 5 minuten.', 'Serveer direct.'];
		const result = cookingStepsFromDirections(directions, {
			language: 'nl',
			recipeTitle: 'Pasta',
			servings: 4
		});

		expect(result.steps.map((step) => step.body)).toEqual(directions);
		expect(result.generation_id).toBeNull();
		expect(result.streams).toEqual([{ id: 'recipe', name: 'Pasta' }]);
	});

	it('extracts Dutch and English timers without generating a cooking plan', () => {
		const result = cookingStepsFromDirections(['Bak 12 minuten.', 'Rest for 1 hour.'], {
			language: 'en',
			recipeTitle: 'Bread',
			servings: null
		});

		expect(result.steps.map((step) => step.timer_seconds)).toEqual([720, 3600]);
	});

	it('turns preparation into the first normal step', () => {
		const plan: CookModeDisplayRecipe = {
			version: 4,
			language: 'en',
			generation_id: 'generation',
			servings: 2,
			mise_en_place: ['Chop the onion', 'Heat the oven.'],
			streams: [{ id: 'main', name: 'Main' }],
			steps: [
				{
					title: 'Cook',
					goal: 'Cook',
					body: 'Cook the onion.',
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

		const result = preparationAsFirstStep(plan);
		expect(result?.mise_en_place).toEqual([]);
		expect(result?.steps.map((step) => step.body)).toEqual([
			'Chop the onion. Heat the oven.',
			'Cook the onion.'
		]);
	});
});
