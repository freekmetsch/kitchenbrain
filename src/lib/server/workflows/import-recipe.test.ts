import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { createImportRecipeService, saveImportedRecipeForApp } from './import-recipe';

const backgroundSpies = vi.hoisted(() => ({
	kickCookModeGeneration: vi.fn()
}));

vi.mock('$lib/server/ai/cook_mode', () => backgroundSpies);
vi.mock('$lib/server/db/index', async () => {
	const { createTestDb } = await import('$lib/server/test_db');
	return { db: createTestDb() };
});

describe('import-recipe workflow', () => {
	it('saves an imported app recipe without requesting cooking details', async () => {
		backgroundSpies.kickCookModeGeneration.mockClear();

		saveImportedRecipeForApp({
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

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(backgroundSpies.kickCookModeGeneration).not.toHaveBeenCalled();
	});

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
