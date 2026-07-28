import { beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type { Ingredient } from '$lib/recipe_ingredient';
import { createTestDb } from '$lib/server/test_db';
import {
	applyRecipePatch,
	clearRecipePatchesForTest,
	getRecipePatchStatus,
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

	it('applies one recipe-scoped product preference without changing recipe content', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		const evidence = new Map<string, RecipePatchEvidence>(
			[
				['block', 'product-block', 'AH Parmigiano Reggiano stuk'],
				['grated', 'product-grated', 'AH Parmigiano Reggiano geraspt'],
				['powder', 'product-powder', 'Parmesello strooikaas']
			].map(([key, productId, productName]) => [
				key,
				{
					key,
					source: 'ah' as const,
					query: 'parmezaanse kaas',
					productId,
					productName,
					packageSize: '100 g',
					price: 3.49
				}
			])
		);
		const proposal = stageRecipePatch(recipe, {
			userId: 1,
			productChoices: [
				{
					ingredient_id: 'ing-bonen',
					reason: 'Kies de gewenste vorm.',
					candidates: [
						{ evidence_key: 'block', form_label: 'Heel stuk' },
						{ evidence_key: 'grated', form_label: 'Vers geraspt' },
						{ evidence_key: 'powder', form_label: 'Strooipoeder' }
					]
				}
			],
			evidence: (key) => evidence.get(key)
		});

		expect(() =>
			applyRecipePatch(db, {
				token: proposal.token,
				userId: 1,
				operationIds: [],
				productSelections: [
					{
						groupId: proposal.productChoices[0].id,
						candidateId: 'product-block'
					}
				]
			})
		).toThrow('Unknown recipe product choice');
		expect(db.select().from(schema.recipeAhPreferences).all()).toEqual([]);
		expect(
			getRecipePatchStatus({ token: proposal.token, userId: 1, recipeSlug: recipe.slug })
		).toBe('active');

		const result = applyRecipePatch(db, {
			token: proposal.token,
			userId: 1,
			operationIds: [],
			productSelections: [
				{
					groupId: proposal.productChoices[0].id,
					candidateId: proposal.productChoices[0].candidates[0].id
				}
			]
		});

		expect(result).toEqual({
			appliedOperations: 0,
			appliedPreferences: 1,
			recipeRevision: 1
		});
		expect(db.select().from(schema.recipeAhPreferences).all()).toMatchObject([
			{
				recipeId: recipe.id,
				ingredientId: 'ing-bonen',
				productId: 'product-block',
				productName: 'AH Parmigiano Reggiano stuk',
				variantLabel: 'Heel stuk'
			}
		]);
		expect(
			getRecipePatchStatus({
				token: proposal.token,
				userId: 1,
				recipeSlug: recipe.slug
			})
		).toBe('applied');
		expect(() =>
			applyRecipePatch(db, {
				token: proposal.token,
				userId: 1,
				operationIds: []
			})
		).toThrow('applied');
		expect(row(db).contentRevision).toBe(1);

		db.delete(schema.recipes).where(eq(schema.recipes.id, recipe.id)).run();
		expect(db.select().from(schema.recipeAhPreferences).all()).toEqual([]);
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

	it('rolls back recipe edits and restores the active token when preference storage fails', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		const evidence = new Map<string, RecipePatchEvidence>(
			['block', 'grated', 'powder'].map((key) => [
				key,
				{
					key,
					source: 'ah',
					query: 'bonen',
					productId: `product-${key}`,
					productName: `Product ${key}`,
					packageSize: '100 g',
					price: 1
				}
			])
		);
		const proposal = stageRecipePatch(recipe, {
			userId: 1,
			operations: [
				{ kind: 'recipe_field', field: 'notes', after: 'Nieuw.', reason: 'Duidelijker.' }
			],
			productChoices: [
				{
					ingredient_id: 'ing-bonen',
					reason: 'Kies.',
					candidates: [
						{ evidence_key: 'block', form_label: 'Heel' },
						{ evidence_key: 'grated', form_label: 'Geraspt' },
						{ evidence_key: 'powder', form_label: 'Poeder' }
					]
				}
			],
			evidence: (key) => evidence.get(key)
		});
		db.run(
			sql.raw(`
				CREATE TRIGGER fail_recipe_preference
				BEFORE INSERT ON recipe_ah_preferences
				BEGIN
					SELECT RAISE(ABORT, 'preference write failed');
				END
			`)
		);

		expect(() =>
			applyRecipePatch(db, {
				token: proposal.token,
				userId: 1,
				operationIds: [proposal.operations[0].id],
				productSelections: [
					{
						groupId: proposal.productChoices[0].id,
						candidateId: proposal.productChoices[0].candidates[0].id
					}
				]
			})
		).toThrow('preference write failed');
		expect(row(db)).toMatchObject({ notes: 'Rustig koken.', contentRevision: 1 });
		expect(db.select().from(schema.recipeAhPreferences).all()).toEqual([]);
		expect(
			getRecipePatchStatus({ token: proposal.token, userId: 1, recipeSlug: recipe.slug })
		).toBe('active');
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
		expect(
			getRecipePatchStatus({ token: proposal.token, userId: 2, recipeSlug: recipe.slug })
		).toBe('expired');
		expect(
			getRecipePatchStatus({ token: proposal.token, userId: 1, recipeSlug: 'other-recipe' })
		).toBe('expired');
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

	it('supersedes only an older active proposal for the same user and recipe', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		const operation = {
			kind: 'recipe_field' as const,
			field: 'notes' as const,
			after: 'Nieuw.',
			reason: 'Duidelijker.'
		};
		const old = stageRecipePatch(recipe, { userId: 1, operations: [operation] });

		expect(() =>
			stageRecipePatch(recipe, {
				userId: 1,
				operations: [
					{
						kind: 'update_ingredient',
						ingredient_id: 'missing',
						changes: { amount: '2' },
						reason: 'Ongeldig.'
					}
				]
			})
		).toThrow('not in this recipe');
		expect(
			getRecipePatchStatus({ token: old.token, userId: 1, recipeSlug: recipe.slug })
		).toBe('active');

		stageRecipePatch(recipe, { userId: 2, operations: [operation] });
		stageRecipePatch(
			{ ...recipe, id: recipe.id + 1, slug: 'andere-stoofpot' },
			{ userId: 1, operations: [operation] }
		);
		expect(
			getRecipePatchStatus({ token: old.token, userId: 1, recipeSlug: recipe.slug })
		).toBe('active');

		const newest = stageRecipePatch(recipe, { userId: 1, operations: [operation] });
		expect(
			getRecipePatchStatus({ token: old.token, userId: 1, recipeSlug: recipe.slug })
		).toBe('superseded');
		expect(
			getRecipePatchStatus({ token: newest.token, userId: 1, recipeSlug: recipe.slug })
		).toBe('active');
	});

	it('binds retailer evidence to the server-resolved current-turn result', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		const evidence: RecipePatchEvidence = {
			key: 'evidence-1',
			source: 'ah',
			query: 'wortel',
			productId: 'ah-winterpeen',
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

		expect(proposal.operations[0].evidence).toEqual({
			key: 'evidence-1',
			source: 'ah',
			query: 'wortel',
			productName: 'AH Winterpeen',
			packageSize: '1 kg',
			price: 1.49
		});
		expect(JSON.stringify(proposal)).not.toContain('ah-winterpeen');
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

	it('stages distinct product forms using opaque current-turn evidence only', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		const evidence = new Map<string, RecipePatchEvidence>(
			[
				['block', 'product-block', 'AH Parmigiano Reggiano stuk'],
				['grated', 'product-grated', 'AH Parmigiano Reggiano geraspt'],
				['powder', 'product-powder', 'Parmesello strooikaas']
			].map(([key, productId, productName]) => [
				key,
				{
					key,
					source: 'ah' as const,
					query: 'parmezaanse kaas',
					productId,
					productName,
					packageSize: '100 g',
					price: 3.49
				}
			])
		);

		const proposal = stageRecipePatch(recipe, {
			userId: 1,
			operations: [],
			productChoices: [
				{
					ingredient_id: 'ing-bonen',
					reason: 'Kies de gewenste vorm.',
					candidates: [
						{ evidence_key: 'block', form_label: 'Heel stuk' },
						{ evidence_key: 'grated', form_label: 'Vers geraspt' },
						{ evidence_key: 'powder', form_label: 'Strooipoeder' }
					]
				}
			],
			evidence: (key) => evidence.get(key)
		});

		expect(proposal.operations).toEqual([]);
		expect(proposal.productChoices[0]).toMatchObject({
			ingredientId: 'ing-bonen',
			candidates: [
				{ formLabel: 'Heel stuk', productName: 'AH Parmigiano Reggiano stuk' },
				{ formLabel: 'Vers geraspt', productName: 'AH Parmigiano Reggiano geraspt' },
				{ formLabel: 'Strooipoeder', productName: 'Parmesello strooikaas' }
			]
		});
		expect(JSON.stringify(proposal)).not.toContain('product-block');

		expect(() =>
			stageRecipePatch(recipe, {
				userId: 1,
				productChoices: [
					{
						ingredient_id: 'ing-bonen',
						reason: 'Dubbel.',
						candidates: [
							{ evidence_key: 'block', form_label: 'Heel stuk' },
							{ evidence_key: 'block', form_label: 'Vers geraspt' },
							{ evidence_key: 'powder', form_label: 'Strooipoeder' }
						]
					}
				],
				evidence: (key) => evidence.get(key)
			})
		).toThrow('unique evidence');
	});

	it('replaces one complete choice group only after a non-overlapping proposal succeeds', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		const evidence = new Map<string, RecipePatchEvidence>();
		for (const [key, productId] of [
			['old-a', 'product-a'],
			['old-b', 'product-b'],
			['old-c', 'product-c'],
			['new-a', 'product-d'],
			['new-b', 'product-e'],
			['new-c', 'product-f'],
			['onion-a', 'onion-product-a'],
			['onion-b', 'onion-product-b'],
			['onion-c', 'onion-product-c']
		]) {
			evidence.set(key, {
				key,
				source: 'ah',
				query: 'bonen',
				productId,
				productName: `Product ${productId}`,
				packageSize: '100 g',
				price: 1
			});
		}
		const old = stageRecipePatch(recipe, {
			userId: 1,
			operations: [
				{ kind: 'recipe_field', field: 'notes', after: 'Nieuw.', reason: 'Duidelijker.' }
			],
			productChoices: [
				{
					ingredient_id: 'ing-bonen',
					reason: 'Kies.',
					candidates: [
						{ evidence_key: 'old-a', form_label: 'Vorm A' },
						{ evidence_key: 'old-b', form_label: 'Vorm B' },
						{ evidence_key: 'old-c', form_label: 'Vorm C' }
					]
				},
				{
					ingredient_id: 'ing-ui',
					reason: 'Kies de ui.',
					candidates: [
						{ evidence_key: 'onion-a', form_label: 'Geel' },
						{ evidence_key: 'onion-b', form_label: 'Rood' },
						{ evidence_key: 'onion-c', form_label: 'Sjalot' }
					]
				}
			],
			evidence: (key) => evidence.get(key)
		});

		expect(() =>
			stageRecipePatch(recipe, {
				userId: 1,
				productChoices: [
					{
						ingredient_id: 'ing-bonen',
						reason: 'Andere opties.',
						candidates: [
							{ evidence_key: 'old-a', form_label: 'Nog A' },
							{ evidence_key: 'new-b', form_label: 'Vorm E' },
							{ evidence_key: 'new-c', form_label: 'Vorm F' }
						]
					}
				],
				evidence: (key) => evidence.get(key),
				replacement: { token: old.token, groupId: old.productChoices[0].id }
			})
		).toThrow('different');
		expect(
			getRecipePatchStatus({ token: old.token, userId: 1, recipeSlug: recipe.slug })
		).toBe('active');

		const replacement = stageRecipePatch(recipe, {
			userId: 1,
			productChoices: [
				{
					ingredient_id: 'ing-bonen',
					reason: 'Andere opties.',
					candidates: [
						{ evidence_key: 'new-a', form_label: 'Vorm D' },
						{ evidence_key: 'new-b', form_label: 'Vorm E' },
						{ evidence_key: 'new-c', form_label: 'Vorm F' }
					]
				}
			],
			evidence: (key) => evidence.get(key),
			replacement: { token: old.token, groupId: old.productChoices[0].id }
		});

		expect(replacement.operations.map((operation) => operation.id)).toEqual(
			old.operations.map((operation) => operation.id)
		);
		expect(replacement.productChoices[0].id).toBe(old.productChoices[0].id);
		expect(replacement.productChoices[1]).toEqual(old.productChoices[1]);
		expect(
			getRecipePatchStatus({ token: old.token, userId: 1, recipeSlug: recipe.slug })
		).toBe('superseded');
		expect(
			getRecipePatchStatus({
				token: replacement.token,
				userId: 1,
				recipeSlug: recipe.slug
			})
		).toBe('active');
	});
});
