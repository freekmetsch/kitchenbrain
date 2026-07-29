import { describe, expect, it } from 'vitest';
import { toolEntityHref } from '$lib/tool_display';
import { buildToolDisplay } from './tool_display';

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

describe('stock action proposal display', () => {
	it('keeps recommendation evidence, atomicity, and adjustable operations structured', () => {
		const display = buildToolDisplay(
			null as never,
			'prepare_stock_action',
			{},
			{
				ok: true,
				kind: 'stock_action_proposal',
				token: 'stock-token',
				status: 'active',
				title: 'Restock rice',
				weekStartDate: '2026-07-29',
				atomicity: { kind: 'atomic', consequence: 'Both changes commit together.' },
				recommendation: {
					whyNow: 'The last rice was used.',
					evidence: ['Rijst has 1 pak in pantry.'],
					confidence: 'high',
					uncertainty: null,
					consequence: 'Stock becomes zero and Shopping is reopened.',
					alternatives: ['Adjust the row', 'Reject this proposal']
				},
				operations: [
					{
						id: 'stock-operation-1',
						kind: 'stock_replace',
						label: 'Rijst',
						before: '1 pak',
						after: 'Set stock to 0 and reopen the existing Shopping source',
						reason: 'No rice remains.'
					}
				]
			}
		);

		expect(display).toMatchObject({
			kind: 'proposal',
			stockActionProposal: {
				token: 'stock-token',
				atomicity: { kind: 'atomic' },
				recommendation: {
					evidence: ['Rijst has 1 pak in pantry.'],
					confidence: 'high'
				},
				operations: [expect.objectContaining({ id: 'stock-operation-1' })]
			}
		});
	});
});
