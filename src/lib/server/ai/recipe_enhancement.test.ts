import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { clearRecipeEnhancementsForTest, stageRecipeEnhancement } from './recipe_enhancement';
import {
	applyRecipeEnhancement,
	createRecipeEnhancementService
} from '$lib/server/workflows/recipe-enhancement';

function setup() {
	const db = createTestDb();
	const now = new Date();
	const recipe = db.insert(schema.recipes).values({ slug: 'soep', title: 'Soep', ingredients: [{ id: 'ui', name: 'ui', amount: '1' }], directions: [], createdAt: now, updatedAt: now }).returning().get();
	return { db, recipe };
}

describe('recipe enhancement proposals', () => {
	beforeEach(clearRecipeEnhancementsForTest);

	it('stages without writing and mints ai_accepted only on apply', () => {
		const { db, recipe } = setup();
		const proposal = stageRecipeEnhancement(recipe, { userId: 1 }, {
			additions: [{ name: 'peterselie', amount: '1', unit: 'bos', reason: 'fris' }],
			substitutes: [{ ingredientId: 'ui', name: 'sjalot', reason: 'milder' }]
		});
		expect(db.select().from(schema.recipes).get()?.ingredients).toHaveLength(1);
		applyRecipeEnhancement(db, { token: proposal.token, userId: 1, additions: [{ id: proposal.additions[0].id, need: 'required' }], substituteIds: [proposal.substitutes[0].id], actor: 'test' });
		const ingredients = db.select().from(schema.recipes).get()!.ingredients;
		expect(ingredients[1]).toMatchObject({ name: 'peterselie', optional: false, origin: 'ai_accepted' });
		expect(ingredients[0].substitutes).toEqual([{ name: 'sjalot' }]);
	});

	it('rejects apply after another canonical edit', () => {
		const { db, recipe } = setup();
		const proposal = stageRecipeEnhancement(recipe, { userId: 1 }, { additions: [{ name: 'prei', amount: '1', reason: 'groente' }], substitutes: [] });
		db.update(schema.recipes).set({ contentRevision: recipe.contentRevision + 1 }).run();
		expect(() => applyRecipeEnhancement(db, { token: proposal.token, userId: 1, additions: [{ id: proposal.additions[0].id, need: 'optional' }], substituteIds: [], actor: 'test' })).toThrow('Recipe changed');
	});

	it('rejects model output when the recipe changed during generation', () => {
		const { db, recipe } = setup();
		db.update(schema.recipes).set({ contentRevision: recipe.contentRevision + 1 }).run();
		expect(() => stageRecipeEnhancement(
			db.select().from(schema.recipes).get()!,
			{
			userId: 1,
			expectedRecipeId: recipe.id, expectedRecipeRevision: recipe.contentRevision
			},
			{ additions: [], substitutes: [] }
		)).toThrow('Recipe changed');
	});

	it('rechecks the canonical recipe after asynchronous generation', async () => {
		const { db, recipe } = setup();
		const service = createRecipeEnhancementService(db, async () => {
			db.update(schema.recipes)
				.set({ contentRevision: recipe.contentRevision + 1 })
				.run();
			return { additions: [], substitutes: [] };
		});

		await expect(
			service.generate({ recipeSlug: recipe.slug, userId: 1 })
		).rejects.toThrow('Recipe changed');
	});

	it('applies only selected suggestions and leaves an empty apply unchanged', () => {
		const { db, recipe } = setup();
		const empty = stageRecipeEnhancement(recipe, { userId: 1 }, {
			additions: [{ name: 'prei', amount: '1', reason: 'groente' }], substitutes: []
		});
		expect(applyRecipeEnhancement(db, { token: empty.token, userId: 1, additions: [], substituteIds: [], actor: 'test' })).toMatchObject({ appliedAdditions: 0, recipeRevision: recipe.contentRevision });

		const selected = stageRecipeEnhancement(recipe, { userId: 1 }, {
			additions: [
				{ name: 'prei', amount: '1', reason: 'groente' },
				{ name: 'selderij', amount: '2', reason: 'groente' }
			], substitutes: []
		});
		applyRecipeEnhancement(db, { token: selected.token, userId: 1, additions: [{ id: selected.additions[1].id, need: 'optional' }], substituteIds: [], actor: 'test' });
		expect(db.select().from(schema.recipes).get()!.ingredients).toHaveLength(2);
		expect(db.select().from(schema.recipes).get()!.ingredients[1]).toMatchObject({ name: 'selderij', optional: true });
	});

	it('rejects expired and cross-user proposals and removes duplicate suggestions', () => {
		const { db, recipe } = setup();
		const proposal = stageRecipeEnhancement(recipe, { userId: 1 }, {
			additions: [{ name: 'ui', amount: '2', reason: 'duplicate' }],
			substitutes: [
				{ ingredientId: 'ui', name: 'sjalot', reason: 'milder' },
				{ ingredientId: 'ui', name: 'sjalot', reason: 'same' }
			]
		});
		expect(proposal.additions).toHaveLength(0);
		expect(proposal.substitutes).toHaveLength(1);
		expect(() => applyRecipeEnhancement(db, { token: proposal.token, userId: 2, additions: [], substituteIds: [], actor: 'test' })).toThrow(/another user/);

		const expired = stageRecipeEnhancement(recipe, { userId: 1 }, { additions: [], substitutes: [] }, 0);
		expect(() => applyRecipeEnhancement(db, { token: expired.token, userId: 1, additions: [], substituteIds: [], actor: 'test' })).toThrow(/expired/);
	});

	it('stores a usually-stocked accepted addition as a household staple', () => {
		const { db, recipe } = setup();
		const proposal = stageRecipeEnhancement(recipe, { userId: 1 }, {
			additions: [{ name: 'bouillonblokje', amount: '1', reason: 'smaak' }], substitutes: []
		});
		applyRecipeEnhancement(db, { token: proposal.token, userId: 1, additions: [{ id: proposal.additions[0].id, need: 'stocked' }], substituteIds: [], actor: 'test' });
		expect(db.select().from(schema.inventoryItems).get()).toMatchObject({ name: 'bouillonblokje', isStaple: true });
	});
});
