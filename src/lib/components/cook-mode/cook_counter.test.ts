import { describe, expect, it } from 'vitest';
import { applySessionSwapsToSteps, toggleCounterIngredient } from './cook_counter';

describe('counter cooking state', () => {
	it('checks counter ingredients without step-completion state', () => {
		expect(toggleCounterIngredient({}, 'berry')).toEqual({ berry: true });
		expect(toggleCounterIngredient({ berry: true }, 'berry')).toEqual({ berry: false });
	});

	it('propagates a session swap to every linked step amount label', () => {
		const step = {
			title: 'Add berries',
			goal: 'Add berries',
			body: 'Add the strawberries.',
			ingredients: ['200 g strawberries'],
			ingredient_ids: ['berry'],
			ingredient_names: ['strawberries'],
			timer_seconds: null,
			timer_purpose: null,
			timer_action: null,
			timer_location: null,
			stream_id: 'filling',
			merges_from: []
		};
		const projected = applySessionSwapsToSteps(
			[step, structuredClone(step)],
			{
				berry: {
					substituteIndex: 0,
					canonicalName: 'frambozen',
					displayName: 'raspberries'
				}
			},
			{ berry: 'strawberries' }
		);
		expect(projected.map((item) => item.ingredients[0])).toEqual([
			'200 g raspberries',
			'200 g raspberries'
		]);
		expect(projected.map((item) => item.body)).toEqual([
			'Add the raspberries.',
			'Add the raspberries.'
		]);
	});
});
