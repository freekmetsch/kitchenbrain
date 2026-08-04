import { describe, expect, it } from 'vitest';
import { toolEntityHref } from '$lib/tool_display';
import { buildToolDisplay, shouldSuppressToolDisplay } from './tool_display';

describe('replayed tool failures', () => {
	it('suppresses only a failure already shown earlier in the turn', () => {
		expect(
			shouldSuppressToolDisplay({ ok: false, error: 'Import failed', duplicate_call: true })
		).toBe(true);
		expect(shouldSuppressToolDisplay({ ok: false, error: 'Import failed' })).toBe(false);
		expect(shouldSuppressToolDisplay({ ok: true, duplicate_call: true })).toBe(false);
		expect(shouldSuppressToolDisplay({ ok: false, tool_failed_for_turn: true })).toBe(true);
	});
});

describe('recipe tool display actions', () => {
	it('links a recipe that needs review directly to its app view', () => {
		const display = buildToolDisplay(
			null as never,
			'edit_recipe',
			{},
			{ ok: true, slug: 'weeknight-curry', needs_review: true }
		);

		expect(display.entityAction).toEqual({
			kind: 'recipe',
			id: 'weeknight-curry',
			intent: 'review'
		});
		expect(toolEntityHref(display.entityAction!, '/kitchen')).toBe(
			'/kitchen/recipes/weeknight-curry'
		);
	});

	it('uses a view action for an ordinary recipe result', () => {
		const display = buildToolDisplay(
			null as never,
			'add_recipe',
			{},
			{ ok: true, slug: 'soup', title: 'Soup', needs_review: false }
		);

		expect(display.entityAction?.intent).toBe('view');
	});

	it('keeps arbitrary entity text inside an encoded local path', () => {
		expect(
			toolEntityHref(
				{ kind: 'recipe', id: 'https://example.com/../../settings', intent: 'view' },
				''
			)
		).toBe('/recipes/https%3A%2F%2Fexample.com%2F..%2F..%2Fsettings');
	});

	it('keeps legacy displays without entity metadata valid', () => {
		expect(toolEntityHref(undefined, '')).toBeNull();
	});
});

describe('meal-plan proposal display', () => {
	it('preserves a sparse typed result without adding recommendation sections', () => {
		const display = buildToolDisplay(
			null as never,
			'propose_meal_plan',
			{},
			{
				ok: true,
				kind: 'meal_plan_proposal',
				token: 'sparse-token',
				status: 'active',
				title: 'Volgende week',
				weekStartDate: '2026-07-29',
				atomicity: {
					kind: 'atomic',
					consequence:
						'The selected meal-plan changes and Shopping reconciliation commit together.'
				},
				recommendation: { evidence: [], alternatives: [] },
				operations: [
					{
						id: 'operation-1',
						kind: 'add',
						label: 'Linzencurry',
						before: null,
						after: '2026-07-31 · fresh · 4 servings',
						reason: 'Past bij de gevraagde week.'
					}
				]
			}
		);

		expect(display.mealPlanProposal?.recommendation).toEqual({
			evidence: [],
			alternatives: []
		});
	});

	it('keeps the recommendation, atomicity, and adjustable operations structured', () => {
		const display = buildToolDisplay(
			null as never,
			'propose_meal_plan',
			{},
			{
				ok: true,
				kind: 'meal_plan_proposal',
				token: 'proposal-token',
				status: 'active',
				title: 'Volgende week',
				weekStartDate: '2026-07-29',
				atomicity: {
					kind: 'atomic',
					consequence:
						'The selected meal-plan changes and Shopping reconciliation commit together.'
				},
				recommendation: {
					whyNow: 'De week is leeg.',
					evidence: ['Linzencurry past bij de voorraad.'],
					confidence: 'high',
					uncertainty: null,
					consequence: 'Plant één maaltijd.',
					alternatives: ['Niet plannen.']
				},
				operations: [
					{
						id: 'operation-1',
						kind: 'add',
						label: 'Linzencurry',
						before: null,
						after: '2026-07-31 · fresh · 4 servings',
						reason: 'Goede voorraaddekking.'
					}
				]
			}
		);

		expect(display).toMatchObject({
			kind: 'proposal',
			summary: 'Review meal plan',
			mealPlanProposal: {
				token: 'proposal-token',
				atomicity: { kind: 'atomic' },
				recommendation: {
					whyNow: expect.any(String),
					evidence: [expect.any(String)],
					confidence: 'high',
					consequence: expect.any(String),
					alternatives: [expect.any(String)]
				},
				operations: [expect.objectContaining({ id: 'operation-1' })]
			}
		});
	});
});
