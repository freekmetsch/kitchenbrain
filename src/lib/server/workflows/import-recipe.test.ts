import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { createImportRecipeService } from './import-recipe';

describe('import-recipe workflow', () => {
	it('returns the persisted recipe result with background generation disabled', () => {
		const db = createTestDb();
		const service = createImportRecipeService(db, {});

		const result = service.save({
			title: 'Tomatensoep',
			category: 'soup',
			servings: 4,
			totalTimeMin: 30,
			sourceUrl: 'https://example.test/tomatensoep',
			imageUrl: null,
			ingredients: [{ id: 'tomaat', name: 'tomaat', amount: '4' }],
			directions: ['Snijd de tomaten.', 'Kook de soep.'],
			notes: null,
			language: 'nl',
			cuisine: null,
			structureVersion: 1,
			structureDraft: null,
			enrichmentReviewReason: null
		});

		expect(result).toEqual({
			slug: 'tomatensoep',
			title: 'Tomatensoep',
			needsReview: false,
			reviewReason: null
		});
		expect(
			db.select().from(schema.recipes).where(eq(schema.recipes.slug, result.slug)).get()
		).toMatchObject({
			title: result.title,
			sourceUrl: 'https://example.test/tomatensoep',
			ingredients: [{ id: 'tomaat', name: 'tomaat', amount: '4' }]
		});
	});
});
