import { describe, expect, it } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import {
	stageDefrostCookingAction,
	stageRescueCookingAction,
	stageTimerCookingAction
} from './cooking_action';

describe('reviewed cooking actions', () => {
	it('stages a timer command without touching client timer state', () => {
		expect(
			stageTimerCookingAction(
				{ operation: 'start', seconds: 600, label: 'Pasta' },
				'timer-1'
			)
		).toMatchObject({
			ok: true,
			kind: 'cooking_action',
			id: 'timer-1',
			actionKind: 'timer',
			timer: {
				operation: 'start',
				seconds: 600,
				label: 'Pasta',
				targetLabel: null
			},
			localized: {
				en: {
					recommendation: {
						confidence: 'high',
						consequence: 'Start “Pasta” for 600 seconds.'
					}
				}
			}
		});
	});

	it('grounds rescue guidance in the saved recipe and selected step in both locales', () => {
		const db = createTestDb();
		const now = new Date('2026-07-29T10:00:00Z');
		const recipe = db
			.insert(schema.recipes)
			.values({
				slug: 'tomatensoep',
				title: 'Tomatensoep',
				titleEn: 'Tomato soup',
				ingredients: [{ id: 'salt', name: 'zout', amount: '1', unit: 'tl' }],
				ingredientsEn: [{ name: 'salt', amount: '1', unit: 'tsp' }],
				directions: ['Laat de soep zacht koken.'],
				directionsEn: ['Simmer the soup gently.'],
				createdAt: now,
				updatedAt: now
			})
			.returning()
			.get();

		const result = stageRescueCookingAction(
			recipe,
			{ issue: 'too_salty', stepIndex: 0 },
			'rescue-1'
		);

		expect(result.rescue).toEqual({
			recipeSlug: 'tomatensoep',
			issue: 'too_salty',
			stepIndex: 0
		});
		expect(result.localized.en.step).toBe('Simmer the soup gently.');
		expect(result.localized.nl.step).toBe('Laat de soep zacht koken.');
		expect(result.localized.en.recommendation.evidence).toContain(
			'Active step 1: Simmer the soup gently.'
		);
		expect(result.localized.en.guidance.join(' ')).toMatch(/salt/i);
		expect(result.localized.nl.guidance.join(' ')).toMatch(/zout/i);
	});

	it('stages a defrost cue from a current freezer snapshot and rejects other zones', () => {
		const db = createTestDb();
		const now = new Date('2026-07-29T10:00:00Z');
		const item = db
			.insert(schema.inventoryItems)
			.values({
				name: 'Lasagne',
				section: 'freezer',
				kind: 'leftover',
				qtyNum: 2,
				unit: 'portion',
				createdAt: now,
				updatedAt: now
			})
			.returning()
			.get();

		expect(stageDefrostCookingAction(item, {}, 'defrost-1')).toMatchObject({
			ok: true,
			id: 'defrost-1',
			actionKind: 'defrost',
			defrost: {
				itemId: item.id,
				itemName: 'Lasagne',
				expectedUpdatedAt: now.toISOString(),
				reminderSeconds: 7200
			}
		});
		expect(
			db.select().from(schema.inventoryOpsLog).all(),
			'preparation is write-nothing'
		).toHaveLength(0);
		expect(() =>
			stageDefrostCookingAction({ ...item, section: 'fridge' }, {}, 'bad-zone')
		).toThrow(/freezer item/i);
	});
});
