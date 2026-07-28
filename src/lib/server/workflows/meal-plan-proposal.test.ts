import { describe, expect, it, vi } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { stageMealPlanProposal } from '$lib/server/ai/meal_plan_proposal';
import { finishMealPlanProposal } from './meal-plan-proposal';

describe('Plan → Shop finish pipeline', () => {
	it('continues an approved plan through Shopping and a read-only AH preview without another prompt', async () => {
		const db = createTestDb();
		const now = new Date();
		db.insert(schema.householdPrefs)
			.values({ key: 'shopping.source_entries.v1', value: 'complete', updatedAt: now })
			.run();
		db.insert(schema.recipes)
			.values({
				slug: 'linzencurry',
				title: 'Linzencurry',
				ingredients: [
					{
						id: 'linzen',
						name: 'linzen',
						amount: '400',
						unit: 'g',
						role: 'cook_in',
						optional: false,
						purchaseForm: 'any',
						scale: 'linear',
						origin: 'source'
					}
				],
				directions: [],
				createdAt: now,
				updatedAt: now
			})
			.run();
		const proposal = stageMealPlanProposal(db, {
			userId: 1,
			weekStartDate: '2026-07-29',
			title: 'Volgende week',
			recommendation: {
				whyNow: 'De week is leeg.',
				evidence: ['Linzencurry is beschikbaar.'],
				confidence: 'high',
				uncertainty: null,
				consequence: 'Plant Linzencurry en maakt de winkellijst klaar.',
				alternatives: ['Niet plannen.']
			},
			operations: [
				{
					kind: 'add',
					dinner: 'Linzencurry',
					recipeSlug: 'linzencurry',
					plannedDate: '2026-07-31',
					servings: 4,
					source: 'fresh',
					note: null,
					reason: 'Vult vrijdag.'
				}
			]
		});
		const preview = vi.fn(async (input: { userId: number; weekStart: string; entryIds: number[] }) => ({
			ok: true as const,
			previewToken: 'ah-preview-token',
			items: input.entryIds.map((id) => ({
				ref: `entries:${id}`,
				sourceName: 'linzen',
				term: 'linzen',
				amount: '400',
				unit: 'g',
				status: 'freetext' as const,
				candidates: [],
				lowConfidence: false,
				incompatibleQuantities: false,
				quantitySources: []
			}))
		}));

		const result = await finishMealPlanProposal(
			db,
			{
				token: proposal.token,
				userId: 1,
				operationIds: proposal.operations.map((operation) => operation.id)
			},
			{
				getAhStatus: () => ({ connected: true, memberName: 'Household' }),
				preview
			}
		);

		expect(preview).toHaveBeenCalledOnce();
		expect(preview).toHaveBeenCalledWith({
			userId: 1,
			weekStart: '2026-07-29',
			entryIds: [expect.any(Number)]
		});
		expect(result).toMatchObject({
			ok: true,
			receipt: { status: 'committed', atomicity: 'atomic' },
			shopping: { ready: 1, blocked: [] },
			next: {
				kind: 'ah_review',
				externalEffect: 'read-only',
				previewToken: 'ah-preview-token'
			}
		});
	});

	it('returns a truthful committed receipt when AH preparation fails after the transaction', async () => {
		const db = createTestDb();
		const now = new Date();
		db.insert(schema.householdPrefs)
			.values({ key: 'shopping.source_entries.v1', value: 'complete', updatedAt: now })
			.run();
		db.insert(schema.recipes)
			.values({
				slug: 'linzensoep',
				title: 'Linzensoep',
				ingredients: [
					{
						id: 'linzen',
						name: 'linzen',
						amount: '400',
						unit: 'g',
						role: 'cook_in',
						optional: false,
						purchaseForm: 'any',
						scale: 'linear',
						origin: 'source'
					}
				],
				directions: [],
				createdAt: now,
				updatedAt: now
			})
			.run();
		const proposal = stageMealPlanProposal(db, {
			userId: 1,
			weekStartDate: '2026-07-29',
			title: 'Volgende week',
			recommendation: {
				whyNow: 'De week is leeg.',
				evidence: ['Linzensoep is beschikbaar.'],
				confidence: 'high',
				uncertainty: null,
				consequence: 'Plant Linzensoep en maakt de winkellijst klaar.',
				alternatives: ['Niet plannen.']
			},
			operations: [
				{
					kind: 'add',
					dinner: 'Linzensoep',
					recipeSlug: 'linzensoep',
					plannedDate: '2026-07-31',
					servings: 4,
					source: 'fresh',
					note: null,
					reason: 'Vult vrijdag.'
				}
			]
		});

		const result = await finishMealPlanProposal(
			db,
			{
				token: proposal.token,
				userId: 1,
				operationIds: proposal.operations.map((operation) => operation.id)
			},
			{
				getAhStatus: () => ({ connected: true, memberName: 'Household' }),
				preview: vi.fn(async () => {
					throw new Error('AH unavailable');
				})
			}
		);

		expect(result).toMatchObject({
			receipt: { status: 'committed', atomicity: 'atomic' },
			shopping: { ready: 1 },
			next: {
				kind: 'blocked',
				reason: 'preview_failed',
				consequence:
					'The meal plan and Shopping list were committed; the AH review could not be prepared.'
			}
		});
		expect(db.select().from(schema.mealPlanMeals).all()).toHaveLength(1);
		expect(db.select().from(schema.shoppingWeekEntries).all()).toHaveLength(1);
	});
});
