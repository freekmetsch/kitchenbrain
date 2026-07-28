import { describe, expect, it } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { getMealSuggestionContext } from './meal-plan-suggestions';

function seedRecipe(
	db: ReturnType<typeof createTestDb>,
	input: {
		slug: string;
		title: string;
		totalTimeMin: number;
		ingredients: Array<{ id: string; name: string; amount: string }>;
		lastCookedAt?: Date;
		rating?: number;
	}
) {
	const now = new Date();
	return db
		.insert(schema.recipes)
		.values({
			...input,
			directions: [],
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();
}

describe('comparable meal recommendation', () => {
	it('returns one deterministic default plus two alternatives with the trust envelope', () => {
		const db = createTestDb();
		const freezer = seedRecipe(db, {
			slug: 'chili',
			title: 'Chili',
			totalTimeMin: 45,
			ingredients: [{ id: 'bean', name: 'bonen', amount: '400' }],
			lastCookedAt: new Date('2026-05-01'),
			rating: 5
		});
		seedRecipe(db, {
			slug: 'pasta',
			title: 'Pasta',
			totalTimeMin: 15,
			ingredients: [{ id: 'tomato', name: 'tomaat', amount: '4' }],
			lastCookedAt: new Date('2026-07-25'),
			rating: 4
		});
		seedRecipe(db, {
			slug: 'curry',
			title: 'Curry',
			totalTimeMin: 30,
			ingredients: [{ id: 'rice', name: 'rijst', amount: '300' }],
			lastCookedAt: new Date('2026-06-01'),
			rating: 4
		});
		db.insert(schema.inventoryItems)
			.values({
				name: 'Chili',
				section: 'freezer',
				qtyNum: 2,
				unit: 'portion',
				kind: 'leftover',
				madeFromRecipeId: freezer.id,
				createdAt: new Date('2026-07-01'),
				updatedAt: new Date('2026-07-01')
			})
			.run();

		const result = getMealSuggestionContext(db, { count: 3 });

		expect(result.recommendation).toMatchObject({
			why_now: expect.any(String),
			evidence: expect.arrayContaining([expect.any(String)]),
			confidence: expect.stringMatching(/^(high|medium|low)$/),
			uncertainty: expect.anything(),
			consequence: expect.any(String),
			default: expect.objectContaining({
				slug: 'chili',
				source: 'freezer',
				frozen_portions_on_hand: 2,
				why: expect.arrayContaining([expect.any(String)])
			}),
			alternatives: [
				expect.objectContaining({ slug: expect.any(String), why: expect.any(Array) }),
				expect.objectContaining({ slug: expect.any(String), why: expect.any(Array) })
			]
		});
	});

	it('uses old matched stock as deterministic ranking pressure', () => {
		const db = createTestDb();
		seedRecipe(db, {
			slug: 'bonensoep',
			title: 'Bonensoep',
			totalTimeMin: 30,
			ingredients: [{ id: 'bean', name: 'bonen', amount: '400' }],
			rating: 3
		});
		seedRecipe(db, {
			slug: 'tomatensoep',
			title: 'Tomatensoep',
			totalTimeMin: 30,
			ingredients: [{ id: 'tomato', name: 'tomaat', amount: '4' }],
			rating: 3
		});
		const oldDate = new Date(Date.now() - 45 * 86_400_000);
		db.insert(schema.inventoryItems)
			.values({
				name: 'bonen',
				section: 'pantry',
				qtyNum: 400,
				unit: 'g',
				kind: 'ingredient',
				createdAt: oldDate,
				updatedAt: oldDate
			})
			.run();

		const result = getMealSuggestionContext(db, { count: 2 });

		expect(result.recommendation?.default).toMatchObject({
			slug: 'bonensoep',
			stale_on_hand: ['bonen'],
			why: expect.arrayContaining([expect.stringMatching(/at least 30 days/)])
		});
	});
});
