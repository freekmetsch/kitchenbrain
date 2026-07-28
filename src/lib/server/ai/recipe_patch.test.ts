import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type { Ingredient } from '$lib/recipe_ingredient';
import { createTestDb } from '$lib/server/test_db';
import {
	applyRecipePatch,
	clearRecipePatchesForTest,
	stageRecipePatch,
	type RecipePatchEvidence
} from './recipe_patch';

function seedRecipe(db: ReturnType<typeof createTestDb>) {
	return db
		.insert(schema.recipes)
		.values({
			slug: 'stoofpot',
			title: 'Stoofpot',
			servings: 4,
			ingredients: [
				{
					id: 'ing-ui',
					name: 'Ui',
					amount: '1',
					unit: 'stuk',
					role: 'cook_in',
					optional: false
				},
				{ id: 'ing-bonen', name: 'Bonen', amount: '400', unit: 'g' }
			],
			directions: ['Snijd de ui.', 'Laat sudderen.'],
			notes: 'Rustig koken.',
			titleEn: 'Stew',
			ingredientsEn: [{ name: 'Onion', amount: '1' }, { name: 'Beans', amount: '400' }],
			directionsEn: ['Chop the onion.', 'Simmer.'],
			translationStatus: 'ready',
			cookModeJson: { version: 2, language: 'en', mise_en_place: [], streams: [], steps: [] },
			cookModeGeneratedAt: new Date(),
			createdAt: new Date(),
			updatedAt: new Date()
		})
		.returning()
		.get();
}

function row(db: ReturnType<typeof createTestDb>) {
	return db.select().from(schema.recipes).where(eq(schema.recipes.slug, 'stoofpot')).get()!;
}

beforeEach(clearRecipePatchesForTest);

describe('typed recipe patches', () => {
	it('applies all supported operation types together against one revision', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		const proposal = stageRecipePatch(recipe, {
			userId: 1,
			operations: [
				{
					kind: 'update_ingredient',
					ingredient_id: 'ing-ui',
					changes: {
						amount: '2',
						unit: null,
						preparation: 'fijngesneden',
						role: 'serve_fresh',
						optional: true
					},
					reason: 'De hoeveelheid en bereiding waren onjuist.'
				},
				{
					kind: 'add_ingredient',
					after: { name: 'Wortel', amount: '2', unit: 'stuks', optional: false },
					reason: 'Wortel hoort in deze stoofpot.'
				},
				{
					kind: 'add_substitute',
					ingredient_id: 'ing-bonen',
					after: { name: 'Kikkererwten', kind: 'vegetable', note: 'Goed afspoelen.' },
					reason: 'Praktisch alternatief.'
				},
				{ kind: 'recipe_field', field: 'servings', after: 6, reason: 'Nieuwe opbrengst.' },
				{
					kind: 'recipe_field',
					field: 'directions',
					after: ['Snijd alles.', 'Laat 30 minuten sudderen.'],
					reason: 'De stappen waren onvolledig.'
				},
				{
					kind: 'recipe_field',
					field: 'notes',
					after: 'Proef voor het serveren.',
					reason: 'Handige afronding.'
				}
			]
		});

		const result = applyRecipePatch(db, {
			token: proposal.token,
			userId: 1,
			operationIds: proposal.operations.map((operation) => operation.id)
		});

		expect(result).toMatchObject({ appliedOperations: 6, recipeRevision: 2 });
		const updated = row(db);
		const ingredients = updated.ingredients as Ingredient[];
		expect(ingredients[0]).toMatchObject({
			id: 'ing-ui',
			name: 'Ui',
			amount: '2',
			preparation: 'fijngesneden',
			role: 'serve_fresh',
			optional: true
		});
		expect(ingredients[0].unit).toBeUndefined();
		expect(ingredients[1].substitutes).toEqual([
			{ name: 'Kikkererwten', kind: 'vegetable', note: 'Goed afspoelen.' }
		]);
		expect(ingredients[2]).toMatchObject({ name: 'Wortel', amount: '2', origin: 'ai_accepted' });
		expect(updated).toMatchObject({
			servings: 6,
			directions: ['Snijd alles.', 'Laat 30 minuten sudderen.'],
			notes: 'Proef voor het serveren.',
			translationStatus: 'pending',
			titleEn: null,
			ingredientsEn: null,
			directionsEn: null,
			cookModeJson: null
		});
	});

	it('applies only selected rows and keeps unselected fields unchanged', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		const proposal = stageRecipePatch(recipe, {
			userId: 1,
			operations: [
				{ kind: 'recipe_field', field: 'servings', after: 8, reason: 'Grotere portie.' },
				{ kind: 'recipe_field', field: 'notes', after: 'Nieuwe notitie.', reason: 'Duidelijker.' }
			]
		});

		applyRecipePatch(db, {
			token: proposal.token,
			userId: 1,
			operationIds: [proposal.operations[1].id]
		});

		expect(row(db)).toMatchObject({ servings: 4, notes: 'Nieuwe notitie.' });
	});

	it('rejects stale, foreign, unknown, and empty proposals without a write', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		const proposal = stageRecipePatch(recipe, {
			userId: 1,
			operations: [
				{ kind: 'recipe_field', field: 'notes', after: 'Nieuw.', reason: 'Correctie.' }
			]
		});
		expect(() =>
			applyRecipePatch(db, {
				token: proposal.token,
				userId: 2,
				operationIds: [proposal.operations[0].id]
			})
		).toThrow(/another user/);

		db.update(schema.recipes)
			.set({ contentRevision: recipe.contentRevision + 1 })
			.where(eq(schema.recipes.id, recipe.id))
			.run();
		expect(() =>
			applyRecipePatch(db, {
				token: proposal.token,
				userId: 1,
				operationIds: [proposal.operations[0].id]
			})
		).toThrow('Recipe changed');
		expect(row(db).notes).toBe('Rustig koken.');

		expect(() =>
			stageRecipePatch(row(db), {
				userId: 1,
				operations: [
					{
						kind: 'update_ingredient',
						ingredient_id: 'missing',
						changes: { amount: '9' },
						reason: 'Onbekend.'
					}
				]
			})
		).toThrow('not in this recipe');
		expect(() =>
			stageRecipePatch(row(db), {
				userId: 1,
				operations: [
					{ kind: 'recipe_field', field: 'notes', after: 'Rustig koken.', reason: 'Zelfde.' }
				]
			})
		).toThrow('no recipe changes');
	});

	it('binds retailer evidence to the server-resolved current-turn result', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		const evidence: RecipePatchEvidence = {
			key: 'evidence-1',
			source: 'ah',
			query: 'wortel',
			productName: 'AH Winterpeen',
			packageSize: '1 kg',
			price: 1.49
		};
		const proposal = stageRecipePatch(recipe, {
			userId: 1,
			evidence: (key) => (key === evidence.key ? evidence : undefined),
			operations: [
				{
					kind: 'add_ingredient',
					after: { name: 'Wortel', amount: '500', unit: 'g' },
					reason: 'Past bij het recept.',
					evidence: { evidence_key: evidence.key }
				}
			]
		});

		expect(proposal.operations[0].evidence).toEqual(evidence);
		expect(() =>
			stageRecipePatch(recipe, {
				userId: 1,
				operations: [
					{
						kind: 'add_ingredient',
						after: { name: 'Prei', amount: '1', unit: 'stuk' },
						reason: 'Past erbij.',
						evidence: { evidence_key: 'forged' }
					}
				]
			})
		).toThrow('unavailable');
	});
});
