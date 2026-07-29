import { describe, expect, it } from 'vitest';
import { mealChoiceHref, toolEntityHref } from '$lib/tool_display';
import { buildToolDisplay } from './tool_display';

describe('recipe tool display actions', () => {
	it('renders freezer checkout as a write-nothing atomic review', () => {
		const display = buildToolDisplay(
			{} as never,
			'mark_meal_cooked',
			{},
			{
				kind: 'after_cook_proposal',
				token: 'after-cook-token',
				status: 'active',
				mealId: 17,
				meal: 'Hachee',
				cookedDate: '2026-07-29',
				availablePortions: 5,
				defaultEatenPortions: 3,
				atomicity: {
					kind: 'atomic',
					consequence: 'Meal and stock commit together.'
				},
				recommendation: {
					whyNow: 'The freezer meal was served.',
					evidence: ['Five linked portions are recorded.'],
					confidence: 'high',
					uncertainty: null,
					consequence: 'Three portions will be consumed.',
					alternatives: ['Adjust the count.', 'Not now.']
				}
			}
		);

		expect(display).toMatchObject({
			kind: 'proposal',
			afterCookProposal: {
				mealId: 17,
				availablePortions: 5,
				defaultEatenPortions: 3,
				atomicity: { kind: 'atomic' }
			}
		});
	});

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

describe('comparable meal-choice display', () => {
	it('keeps the default and alternatives comparable and creates a validated cook handoff', () => {
		const display = buildToolDisplay(
			null as never,
			'suggest_meals',
			{},
			{
				recommendation: {
					why_now: 'Best current fit.',
					evidence: ['Two freezer portions are ready.'],
					confidence: 'high',
					uncertainty: null,
					consequence: 'Uses two freezer portions.',
					default: {
						slug: 'chili',
						title: 'Chili',
						source: 'freezer',
						servings: 2,
						total_time_min: 10,
						on_hand: ['bonen'],
						missing_items: ['limoen'],
						stale_on_hand: [],
						frozen_portions_on_hand: 2,
						days_since_cooked: 40,
						freezer_effect: 'Uses 2 ready freezer portions',
						why: ['2 freezer portions are ready']
					},
					alternatives: [
						{
							slug: 'pasta',
							title: 'Pasta',
							source: 'fresh',
							servings: 4,
							total_time_min: 20,
							on_hand: ['pasta'],
							missing_items: ['tomaat'],
							stale_on_hand: ['pasta'],
							frozen_portions_on_hand: 0,
							days_since_cooked: 21,
							freezer_effect: 'Does not change freezer portions',
							why: ['1 of 2 ingredients are on hand']
						}
					]
				}
			}
		);

		expect(display).toMatchObject({
			kind: 'read',
			mealChoices: {
				confidence: 'high',
				options: [
					expect.objectContaining({ slug: 'chili', servings: 2, source: 'freezer' }),
					expect.objectContaining({ slug: 'pasta', source: 'fresh' })
				]
			}
		});
		expect(mealChoiceHref(display.mealChoices!.options[0], '/kitchen')).toBe(
			'/kitchen/recipes/chili?servings=2&source=freezer'
		);
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
