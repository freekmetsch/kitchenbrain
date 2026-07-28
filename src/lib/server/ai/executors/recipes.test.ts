import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type { Ingredient } from '$lib/recipe_ingredient';
import { createTestDb, type TestDb } from '$lib/server/test_db';
import { executeToolCall, isOk } from './index';
import type { TurnExecutionContext } from '../commit_risk';
import { createTurnSafetyState } from '../turn_safety';

function turnCtx(): TurnExecutionContext {
	return {
		createdThisTurn: new Set(),
		destructiveCount: 0,
		safety: createTurnSafetyState()
	};
}

function seedRecipe(
	db: TestDb,
	slug: string,
	ingredients: Ingredient[],
	extra: Partial<typeof schema.recipes.$inferInsert> = {}
) {
	const now = new Date();
	return db
		.insert(schema.recipes)
		.values({
			slug,
			title: slug,
			ingredients,
			directions: ['Doe alles in een pan.'],
			createdAt: now,
			updatedAt: now,
			...extra
		})
		.returning()
		.get();
}

function recipeBySlug(db: TestDb, slug: string) {
	return db.select().from(schema.recipes).where(eq(schema.recipes.slug, slug)).get()!;
}

async function readRecipe(db: TestDb, slug: string, context = turnCtx()) {
	await executeToolCall('get_recipe', { slug }, db, 1, context);
	return context;
}

describe('recipe agent writes', () => {
	it('creates a recipe with server-minted stable ingredient IDs', async () => {
		const db = createTestDb();
		const result = await executeToolCall(
			'add_recipe',
			{
				title: 'Nieuwe soep',
				slug: 'nieuwe-soep',
				servings: 4,
				ingredients: [
					{
						name: 'Ui',
						amount: '1',
						role: 'cook_in',
						optional: false,
						purchaseForm: 'fresh',
						scale: 'whole',
						origin: 'source'
					}
				],
				directions: ['Snijd de ui.', 'Kook de soep.']
			},
			db,
			1,
			turnCtx()
		);

		expect(isOk(result)).toBe(true);
		const recipe = recipeBySlug(db, 'nieuwe-soep');
		expect((recipe.ingredients as Ingredient[])[0].id).toMatch(/^ing_/);
		expect(recipe.directionIdsJson).toHaveLength(2);
	});

	it('sets roles by ingredient ID even when names are duplicated', async () => {
		const db = createTestDb();
		seedRecipe(db, 'knoflook', [
			{ id: 'ing-first', name: 'Knoflook', amount: '2' },
			{ id: 'ing-second', name: 'Knoflook', amount: '4' }
		]);
		const context = await readRecipe(db, 'knoflook');

		const result = await executeToolCall(
			'edit_recipe',
			{
				slug: 'knoflook',
				set_ingredient_roles: [{ ingredient_id: 'ing-second', role: 'serve_fresh' }]
			},
			db,
			1,
			context
		);

		expect(result).toMatchObject({ ok: true, roles_applied: ['Knoflook'] });
		const ingredients = recipeBySlug(db, 'knoflook').ingredients as Ingredient[];
		expect(ingredients[0].role).toBeUndefined();
		expect(ingredients[1].role).toBe('serve_fresh');
	});

	it('reports a truthful no-op and does not increment the recipe revision', async () => {
		const db = createTestDb();
		seedRecipe(db, 'rijst', [
			{ id: 'ing-rijst', name: 'Rijst', amount: '200', role: 'cook_in' }
		]);
		const context = await readRecipe(db, 'rijst');

		const result = await executeToolCall(
			'edit_recipe',
			{
				slug: 'rijst',
				set_ingredient_roles: [{ ingredient_id: 'ing-rijst', role: 'cook_in' }]
			},
			db,
			1,
			context
		);

		expect(result).toMatchObject({ ok: false, unchanged: true, roles_unchanged: ['Rijst'] });
		expect(recipeBySlug(db, 'rijst').contentRevision).toBe(1);
	});

	it('applies valid role IDs and names the invalid IDs without claiming full success', async () => {
		const db = createTestDb();
		seedRecipe(db, 'rijst', [{ id: 'ing-rijst', name: 'Rijst', amount: '200' }]);
		const context = await readRecipe(db, 'rijst');

		const result = await executeToolCall(
			'edit_recipe',
			{
				slug: 'rijst',
				set_ingredient_roles: [
					{ ingredient_id: 'ing-rijst', role: 'cook_in' },
					{ ingredient_id: 'missing', role: 'serve_fresh' }
				]
			},
			db,
			1,
			context
		);

		expect(result).toMatchObject({
			ok: true,
			roles_applied: ['Rijst'],
			roles_unmatched: ['missing']
		});
	});

	it('rejects direct content fields after an authoritative read', async () => {
		const db = createTestDb();
		seedRecipe(db, 'stoofpot', [{ id: 'ing-ui', name: 'Ui', amount: '1' }]);
		const context = await readRecipe(db, 'stoofpot');

		const result = await executeToolCall(
			'edit_recipe',
			{ slug: 'stoofpot', notes: 'Directe wijziging' },
			db,
			1,
			context
		);

		expect(result).toMatchObject({ ok: false, contract_error: 'invalid_input' });
		expect(recipeBySlug(db, 'stoofpot')).toMatchObject({ notes: null, contentRevision: 1 });
	});

	it('stages a typed content patch without changing the recipe', async () => {
		const db = createTestDb();
		seedRecipe(db, 'stoofpot', [{ id: 'ing-ui', name: 'Ui', amount: '1' }]);
		const context = await readRecipe(db, 'stoofpot');

		const result = await executeToolCall(
			'propose_recipe_patch',
			{
				slug: 'stoofpot',
				operations: [
					{
						kind: 'update_ingredient',
						ingredient_id: 'ing-ui',
						changes: { amount: '2' },
						reason: 'De hoeveelheid moet twee zijn.'
					}
				]
			},
			db,
			1,
			context
		);

		expect(result).toMatchObject({
			ok: true,
			kind: 'recipe_patch',
			operations: [
				expect.objectContaining({ label: 'Ui', before: 'amount: 1', after: 'amount: 2' })
			]
		});
		expect(recipeBySlug(db, 'stoofpot').contentRevision).toBe(1);
	});

	it('changes freezer-staple state only after reading the recipe', async () => {
		const db = createTestDb();
		seedRecipe(db, 'stamppot', [], { freezerStapleOptOut: true });
		const context = await readRecipe(db, 'stamppot');

		const result = await executeToolCall(
			'set_freezer_staple',
			{ slug: 'stamppot', is_freezer_staple: true, target_portions: 6 },
			db,
			1,
			context
		);

		expect(result).toMatchObject({ ok: true, target_portions: 6 });
		expect(recipeBySlug(db, 'stamppot')).toMatchObject({
			isFreezerStaple: true,
			targetPortions: 6,
			freezerStapleOptOut: false
		});
	});

	it('rejects guessed recipe targets without writing', async () => {
		const db = createTestDb();
		const result = await executeToolCall(
			'set_freezer_staple',
			{ slug: 'bestaat-niet', is_freezer_staple: true },
			db,
			1,
			turnCtx()
		);

		expect(result).toMatchObject({ ok: false, contract_error: 'missing_provenance' });
	});
});
