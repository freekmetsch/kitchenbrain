// Dispatch coverage for the recipe write executors: edit_recipe (ingredient
// set edits, deterministic role assignment, bench-sheet invalidation) and
// set_freezer_staple (keep-stocked flag + opt-out memory, UX-STOCK-14).
// Runs the REAL executeToolCall against a throwaway in-memory DB.
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type { Ingredient } from '$lib/server/db/schema';
import type { CookModeRecipe } from '$lib/types';
import { createTestDb, type TestDb } from '$lib/server/test_db';
import { executeToolCall, isOk } from './index';
import type { TurnExecutionContext } from '../commit_risk';

const turnCtx = (): TurnExecutionContext => ({ createdThisTurn: new Set(), destructiveCount: 0 });

const benchSheet: CookModeRecipe = { mise_en_place: [], streams: [], steps: [] };

type EditResult = {
	ok: boolean;
	error?: string;
	roles_applied?: string[];
	roles_ambiguous?: string[];
	roles_unmatched?: string[];
	needs_review?: boolean;
};
type StapleResult = {
	ok: boolean;
	error?: string;
	is_freezer_staple?: boolean;
	target_portions?: number | null;
};
type ErrorResult = { error?: string };

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

describe('edit_recipe', () => {
	it('adds and removes ingredients, updates servings/notes, and clears the stale bench sheet', async () => {
		const db = createTestDb();
		seedRecipe(
			db,
			'stoofpot',
			[
				{ name: 'Ui', amount: '1', unit: 'stuks' },
				{ name: 'Knoflook', amount: '2', unit: 'teentjes' }
			],
			{ cookModeJson: benchSheet, cookModeGeneratedAt: new Date() }
		);

		const res = (await executeToolCall(
			'edit_recipe',
			{
				slug: 'stoofpot',
				servings: 4,
				notes: 'Extra pittig',
				add_ingredients: [{ name: 'Rijst', amount: '200', unit: 'g' }],
				remove_ingredient_names: ['Ui']
			},
			db,
			1,
			turnCtx()
		)) as EditResult;

		expect(isOk(res)).toBe(true);
		const row = recipeBySlug(db, 'stoofpot');
		expect((row.ingredients as Ingredient[]).map((i) => i.name)).toEqual(['Knoflook', 'Rijst']);
		expect(row.servings).toBe(4);
		expect(row.notes).toBe('Extra pittig');
		// Ingredient-set change invalidates the cached bench sheet.
		expect(row.cookModeJson).toBeNull();
		expect(row.cookModeGeneratedAt).toBeNull();
	});

	it('sets a role when the name matches exactly one ingredient, keeping the bench sheet', async () => {
		const db = createTestDb();
		seedRecipe(
			db,
			'kip-rijst',
			[
				{ name: 'Rijst', amount: '200', unit: 'g' },
				{ name: 'Kipfilet', amount: '300', unit: 'g' }
			],
			{ cookModeJson: benchSheet, cookModeGeneratedAt: new Date() }
		);

		const res = (await executeToolCall(
			'edit_recipe',
			{ slug: 'kip-rijst', set_ingredient_roles: [{ name: 'Rijst', role: 'serve_fresh' }] },
			db,
			1,
			turnCtx()
		)) as EditResult;

		expect(isOk(res)).toBe(true);
		expect(res.roles_applied).toEqual(['Rijst']);
		const row = recipeBySlug(db, 'kip-rijst');
		const ings = row.ingredients as Ingredient[];
		expect(ings.find((i) => i.name === 'Rijst')?.role).toBe('serve_fresh');
		expect(ings.find((i) => i.name === 'Kipfilet')?.role).toBeUndefined();
		// Role-only edits keep the cached bench sheet (roles don't appear on it).
		expect(row.cookModeJson).not.toBeNull();
	});

	it('flags the recipe for review on an ambiguous role match instead of guessing', async () => {
		const db = createTestDb();
		seedRecipe(db, 'knoflookpasta', [
			{ name: 'Knoflook', amount: '2', unit: 'teentjes' },
			{ name: 'Knoflookteentjes', amount: '4', unit: 'stuks' }
		]);

		const res = (await executeToolCall(
			'edit_recipe',
			{ slug: 'knoflookpasta', set_ingredient_roles: [{ name: 'Knoflook', role: 'cook_in' }] },
			db,
			1,
			turnCtx()
		)) as EditResult;

		expect(isOk(res)).toBe(true);
		expect(res.roles_ambiguous).toEqual(['Knoflook']);
		expect(res.needs_review).toBe(true);
		const row = recipeBySlug(db, 'knoflookpasta');
		expect(row.needsReview).toBe(true);
		expect(row.reviewReason).toContain('Ambiguous ingredient role match');
		// No role was silently picked.
		for (const ing of row.ingredients as Ingredient[]) expect(ing.role).toBeUndefined();
	});

	it('reports role names that match no ingredient', async () => {
		const db = createTestDb();
		seedRecipe(db, 'kip-rijst', [{ name: 'Kipfilet', amount: '300', unit: 'g' }]);

		const res = (await executeToolCall(
			'edit_recipe',
			{ slug: 'kip-rijst', set_ingredient_roles: [{ name: 'Zalm', role: 'cook_in' }] },
			db,
			1,
			turnCtx()
		)) as EditResult;

		expect(isOk(res)).toBe(true);
		expect(res.roles_unmatched).toEqual(['Zalm']);
	});

	it('reports a clean error for an unknown recipe', async () => {
		const db = createTestDb();
		const res = (await executeToolCall(
			'edit_recipe',
			{ slug: 'bestaat-niet', servings: 2 },
			db,
			1,
			turnCtx()
		)) as EditResult;
		expect(res.ok).toBe(false);
		expect(res.error).toBe('Recipe not found');
	});

	it('rejects malformed args with a clean error instead of throwing', async () => {
		const db = createTestDb();
		seedRecipe(db, 'stoofpot', [{ name: 'Ui', amount: '1' }]);
		const res = (await executeToolCall(
			'edit_recipe',
			{ slug: 'stoofpot', add_ingredients: [{ name: 'Rijst' }] }, // missing amount
			db,
			1,
			turnCtx()
		)) as ErrorResult;
		expect(res.error).toMatch(/^Invalid input for add_ingredients/);
		// Nothing changed.
		const row = recipeBySlug(db, 'stoofpot');
		expect((row.ingredients as Ingredient[]).map((i) => i.name)).toEqual(['Ui']);
	});
});

describe('set_freezer_staple', () => {
	it('marks a recipe as freezer staple with a target and clears the opt-out', async () => {
		const db = createTestDb();
		seedRecipe(db, 'stamppot', [], { freezerStapleOptOut: true });

		const res = (await executeToolCall(
			'set_freezer_staple',
			{ slug: 'stamppot', is_freezer_staple: true, target_portions: 6 },
			db,
			1,
			turnCtx()
		)) as StapleResult;

		expect(isOk(res)).toBe(true);
		expect(res.target_portions).toBe(6);
		const row = recipeBySlug(db, 'stamppot');
		expect(row.isFreezerStaple).toBe(true);
		expect(row.freezerStapleOptOut).toBe(false);
		expect(row.targetPortions).toBe(6);
	});

	it('keeps the existing target when toggling on without one', async () => {
		const db = createTestDb();
		seedRecipe(db, 'stamppot', [], { targetPortions: 4 });

		const res = (await executeToolCall(
			'set_freezer_staple',
			{ slug: 'stamppot', is_freezer_staple: true },
			db,
			1,
			turnCtx()
		)) as StapleResult;

		expect(isOk(res)).toBe(true);
		expect(res.target_portions).toBe(4);
		expect(recipeBySlug(db, 'stamppot').targetPortions).toBe(4);
	});

	it('toggling off records the opt-out and drops the target', async () => {
		const db = createTestDb();
		seedRecipe(db, 'stamppot', [], { isFreezerStaple: true, targetPortions: 6 });

		const res = (await executeToolCall(
			'set_freezer_staple',
			{ slug: 'stamppot', is_freezer_staple: false },
			db,
			1,
			turnCtx()
		)) as StapleResult;

		expect(isOk(res)).toBe(true);
		expect(res.target_portions).toBeNull();
		const row = recipeBySlug(db, 'stamppot');
		expect(row.isFreezerStaple).toBe(false);
		expect(row.freezerStapleOptOut).toBe(true);
		expect(row.targetPortions).toBeNull();
	});

	it('reports a clean error for an unknown recipe', async () => {
		const db = createTestDb();
		const res = (await executeToolCall(
			'set_freezer_staple',
			{ slug: 'bestaat-niet', is_freezer_staple: true },
			db,
			1,
			turnCtx()
		)) as StapleResult;
		expect(res.ok).toBe(false);
		expect(res.error).toBe('Recipe not found');
	});

	it('rejects an out-of-range target with a clean error instead of throwing', async () => {
		const db = createTestDb();
		seedRecipe(db, 'stamppot', []);
		const res = (await executeToolCall(
			'set_freezer_staple',
			{ slug: 'stamppot', is_freezer_staple: true, target_portions: 0 },
			db,
			1,
			turnCtx()
		)) as ErrorResult;
		expect(res.error).toMatch(/^Invalid input for target_portions/);
		expect(recipeBySlug(db, 'stamppot').isFreezerStaple).toBe(false);
	});
});
