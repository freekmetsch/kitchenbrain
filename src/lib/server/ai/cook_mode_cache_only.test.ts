import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';

const ai = vi.hoisted(() => ({
	createMessage: vi.fn(),
	logSpend: vi.fn()
}));

vi.mock('$lib/server/ai/client', () => ({
	createMessage: ai.createMessage,
	checkDailyCap: () => ({ exceeded: false }),
	DailyCapExceeded: class DailyCapExceeded extends Error {},
	loadPrompt: () => 'test cook-mode prompt',
	logSpend: ai.logSpend,
	parseModelJson: JSON.parse
}));

vi.mock('$lib/server/ai/config', () => ({
	getChatModel: () => ({ value: 'test-model' }),
	getChatFallbackModel: () => ({ value: 'test-fallback' })
}));

vi.mock('$lib/server/db/index', async () => {
	const { createTestDb } = await import('$lib/server/test_db');
	return { db: createTestDb() };
});

import { db } from '$lib/server/db/index';
import { createImportedRecipe } from '$lib/server/domains/recipes/create';
import { generateCookMode } from './cook_mode';

describe('explicit cooking-details generation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('writes only the cooking-details cache for an untouched import', async () => {
		const { recipe } = createImportedRecipe(db, {
			title: 'Cache-only uiensoep',
			category: 'soup',
			servings: 4,
			totalTimeMin: 20,
			sourceUrl: 'https://example.test/cache-only-uiensoep',
			imageUrl: null,
			ingredients: [{ id: 'ing-ui', name: 'ui', amount: '1' }],
			directions: ['Snijd de ui.'],
			notes: null,
			language: 'nl',
			cuisine: null,
			structureVersion: 1,
			structureDraft: null,
			enrichmentReviewReason: null
		});
		const directionId = recipe.directionIdsJson[0];
		ai.createMessage.mockResolvedValue({
			model: 'test-model',
			usage: {},
			costUsd: 0,
			text: JSON.stringify({
				version: 5,
				instructions: [
					{
						direction_id: directionId,
						text: { en: 'Dice the onion.', nl: 'Snipper de ui.' }
					}
				],
				streams: [{ id: 'main', name: { en: 'Soup pot', nl: 'Soeppan' } }],
				steps: [
					{
						step_id: 'step-1',
						direction_id: directionId,
						ingredient_uses: [
							{ ingredient_id: 'ing-ui', allocation: { kind: 'all' } }
						],
						stream_id: 'main',
						merges_from: []
					}
				]
			})
		});

		const before = db
			.select()
			.from(schema.recipes)
			.where(eq(schema.recipes.id, recipe.id))
			.get()!;
		const result = await generateCookMode(recipe.slug, { language: 'nl', servings: 4 });
		const after = db
			.select()
			.from(schema.recipes)
			.where(eq(schema.recipes.id, recipe.id))
			.get()!;

		expect(result?.generated).toBe(true);
		expect(after).toMatchObject({
			contentRevision: before.contentRevision,
			directions: before.directions,
			directionsEn: before.directionsEn,
			ingredients: before.ingredients,
			sourceSnapshotJson: before.sourceSnapshotJson
		});
		expect(after.cookModeJson).toMatchObject({
			version: 5,
			content_revision: before.contentRevision
		});
	});
});
