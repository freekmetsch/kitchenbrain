import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/ai/client', () => ({
	checkDailyCap: () => ({ exceeded: false, totalEur: 0 }),
	createMessage: vi.fn(),
	loadPrompt: vi.fn(),
	logSpend: vi.fn(),
	parseModelJson: JSON.parse
}));
vi.mock('$lib/server/ai/config', () => ({ getChatModel: () => ({ value: 'test' }), getBackgroundModel: () => ({ value: 'test' }) }));
vi.mock('$lib/server/ai/cook_mode', () => ({ kickCookModeGeneration: vi.fn() }));
vi.mock('$lib/server/ai/translate_recipe', () => ({ kickTranslateOnImport: vi.fn() }));
vi.mock('$lib/server/recipes/prefs', () => ({ getAutoTranslateOnImport: () => false, getCookModePreGeneration: () => false }));
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { normalizeLegacyRecipes } from './recipe_normalization';

function seed(db: ReturnType<typeof createTestDb>, slug = 'preisoep') {
	return db.insert(schema.recipes).values({
		slug,
		title: 'Preisoep',
		servings: 4,
		ingredients: [{ name: 'gehakte prei', amount: '2' }],
		directions: ['Bak de prei.'],
		createdAt: new Date(),
		updatedAt: new Date()
	}).returning().get();
}

describe('legacy recipe normalization', () => {
	it('applies a high-confidence result transactionally', async () => {
		const db = createTestDb();
		seed(db);
		const result = await normalizeLegacyRecipes(db, {
			capExceeded: () => false,
			enrich: async (data) => ({
				...data,
				ingredients: [{ name: 'prei', amount: '2', preparation: 'gehakt', role: 'cook_in', purchaseForm: 'fresh', scale: 'linear', optional: false, origin: 'source' }],
				structureVersion: 2,
				structureDraft: null,
				enrichmentReviewReason: null
			})
		});
		expect(result).toMatchObject({ improved: 1, remaining: 0 });
		expect(db.select().from(schema.recipes).get()).toMatchObject({ structureVersion: 2, needsReview: false });
	});

	it('stages low-confidence proposals once and leaves source ingredients unchanged', async () => {
		const db = createTestDb();
		seed(db);
		const result = await normalizeLegacyRecipes(db, {
			capExceeded: () => false,
			enrich: async (data) => ({
				...data,
				structureDraft: [{ name: 'prei', amount: '2', preparation: 'gehakt' }],
				structureVersion: 1,
				enrichmentReviewReason: 'Preparation is uncertain.'
			})
		});
		const recipe = db.select().from(schema.recipes).get()!;
		expect(result).toMatchObject({ needsReview: 1, remaining: 0 });
		expect(recipe.ingredients[0].name).toBe('gehakte prei');
		expect(recipe.structureDraft?.[0].name).toBe('prei');
		expect(recipe.structureDraftSourceUpdatedAt?.getTime()).toBe(recipe.updatedAt.getTime());
	});

	it('stops at the cap and skips an already-v2 recipe', async () => {
		const db = createTestDb();
		seed(db, 'legacy');
		const current = seed(db, 'current');
		db.update(schema.recipes).set({ structureVersion: 2 }).where(eq(schema.recipes.id, current.id)).run();
		const result = await normalizeLegacyRecipes(db, { capExceeded: () => true });
		expect(result).toMatchObject({ processed: 0, capReached: true, remaining: 1 });
	});

	it('does not overwrite a concurrent edit', async () => {
		const db = createTestDb();
		const recipe = seed(db);
		const result = await normalizeLegacyRecipes(db, {
			capExceeded: () => false,
			enrich: async (data) => {
				db.update(schema.recipes).set({ title: 'Handmatig aangepast', updatedAt: new Date(Date.now() + 1000) })
					.where(eq(schema.recipes.id, recipe.id)).run();
				return { ...data, ingredients: [{ name: 'prei', amount: '2' }], structureVersion: 2, structureDraft: null, enrichmentReviewReason: null };
			}
		});
		expect(result.stale).toBe(1);
		expect(db.select().from(schema.recipes).get()?.title).toBe('Handmatig aangepast');
	});
});
