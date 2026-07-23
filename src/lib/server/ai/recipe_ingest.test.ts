import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';

vi.mock('$lib/server/ai/client', () => ({
	checkDailyCap: () => ({ exceeded: false, totalEur: 0 }),
	createMessage: vi.fn(),
	loadPrompt: vi.fn(),
	logSpend: vi.fn(),
	parseModelJson: JSON.parse
}));
vi.mock('$lib/server/ai/config', () => ({ getChatModel: () => ({ value: 'test' }), getBackgroundModel: () => ({ value: 'test' }) }));
vi.mock('$lib/server/ai/translate_recipe', () => ({ kickTranslateOnImport: vi.fn() }));
vi.mock('$lib/server/recipes/prefs', () => ({ getAutoTranslateOnImport: () => false }));
import { createTestDb } from '$lib/server/test_db';
import { insertScrapedRecipe, validateRecipeEnrichment } from './recipe_ingest';

const sourceIngredient = (sourceIndex: number, overrides: Record<string, unknown> = {}) => ({
	sourceIndex,
	name: sourceIndex === 0 ? 'prei' : 'ei',
	amount: sourceIndex === 0 ? '1' : '2',
	preparation: sourceIndex === 0 ? 'gehakt' : 'gebakken',
	role: 'cook_in',
	optional: false,
	purchaseForm: 'fresh',
	scale: sourceIndex === 0 ? 'linear' : 'whole',
	origin: 'source',
	...overrides
});

describe('recipe enrichment writer gate', () => {
	it('captures an immutable source snapshot and direction IDs on URL import', () => {
		const db = createTestDb();
		const saved = insertScrapedRecipe(db, {
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
			rawIngredients: ['4 tomaten'],
			structureVersion: 2,
			structureDraft: null,
			enrichmentReviewReason: null
		});
		const recipe = db
			.select()
			.from(schema.recipes)
			.where(eq(schema.recipes.slug, saved.slug))
			.get()!;
		expect(recipe.directionIdsJson).toHaveLength(2);
		expect(recipe.sourceSnapshotJson).toMatchObject({
			provenance: 'imported_source',
			title: 'Tomatensoep',
			directions: ['Snijd de tomaten.', 'Kook de soep.']
		});
	});

	it('separates preparation from Dutch base names and preserves source coverage', () => {
		const result = validateRecipeEnrichment({
			confidence: 'high',
			reviewReason: null,
			ingredients: [sourceIngredient(0), sourceIngredient(1)]
		}, 2);
		expect(result.ingredients).toMatchObject([
			{ name: 'prei', preparation: 'gehakt' },
			{ name: 'ei', preparation: 'gebakken', scale: 'whole' }
		]);
	});

	it('keeps preserved purchase requirements and optional suggested sides', () => {
		const result = validateRecipeEnrichment({
			confidence: 'high',
			reviewReason: null,
			ingredients: [
				sourceIngredient(0, { name: 'kikkererwten', purchaseForm: 'preserved' }),
				{
					sourceIndex: null,
					name: 'kroepoek',
					amount: '1',
					unit: 'zak',
					role: 'serve_fresh',
					optional: true,
					purchaseForm: 'any',
					scale: 'linear',
					origin: 'ai_suggested'
				}
			]
		}, 1);
		expect(result.ingredients[0].purchaseForm).toBe('preserved');
		expect(result.ingredients[1]).toMatchObject({ optional: true, origin: 'ai_suggested' });
	});

	it.each([
		{ label: 'omitted source', ingredients: [sourceIngredient(0)], sourceCount: 2 },
		{ label: 'duplicate source', ingredients: [sourceIngredient(0), sourceIngredient(0)], sourceCount: 2 },
		{
			label: 'required suggestion',
			ingredients: [sourceIngredient(0), sourceIngredient(1, { sourceIndex: null, origin: 'ai_suggested', optional: false })],
			sourceCount: 1
		}
	])('rejects $label', ({ ingredients, sourceCount }) => {
		expect(() => validateRecipeEnrichment({ confidence: 'high', reviewReason: null, ingredients }, sourceCount)).toThrow();
	});
});
