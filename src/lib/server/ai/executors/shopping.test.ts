// Dispatch coverage for generate_shopping_list: derives the week's missing
// ingredients from planned meals' recipes minus live inventory, matched on the
// canonical Dutch name key (exact-key, not substring — AH invariant). Runs the
// REAL executeToolCall against a throwaway in-memory DB.
import { describe, it, expect } from 'vitest';
import * as schema from '$lib/server/db/schema';
import type { Ingredient } from '$lib/server/db/schema';
import { createTestDb, type TestDb } from '$lib/server/test_db';
import { addInventory } from '$lib/server/inventory_writes';
import { isoWeekStart } from '$lib/week';
import { executeToolCall } from './index';
import type { TurnExecutionContext } from '../commit_risk';

const turnCtx = (): TurnExecutionContext => ({ createdThisTurn: new Set(), destructiveCount: 0 });

const WEEK = '2026-07-06'; // a Monday

type ShoppingResult = {
	week: string;
	shopping_list: { name: string; amount: string; unit: string | null }[];
	meals_without_recipe: string[];
	note: string;
};
type ErrorResult = { error?: string };

function seedRecipe(db: TestDb, slug: string, ingredients: Ingredient[]) {
	const now = new Date();
	return db
		.insert(schema.recipes)
		.values({ slug, title: slug, ingredients, directions: [], createdAt: now, updatedAt: now })
		.returning()
		.get();
}

function seedStock(db: TestDb, name: string) {
	return addInventory(
		db,
		{ name, section: 'pantry', qtyNum: 1 },
		{ actor: 'ai', userId: 1 }
	);
}

async function planMeal(db: TestDb, dinner: string, recipeSlug?: string) {
	return executeToolCall(
		'plan_meal',
		{ week_start_date: WEEK, dinner, recipe_slug: recipeSlug },
		db,
		1,
		turnCtx()
	);
}

describe('generate_shopping_list', () => {
	it('lists missing ingredients for the week, excluding stock on hand', async () => {
		const db = createTestDb();
		seedRecipe(db, 'kip-met-rijst', [
			{ name: 'Kipfilet', amount: '300', unit: 'g' },
			{ name: 'Rijst', amount: '200', unit: 'g' }
		]);
		await planMeal(db, 'Kip met rijst', 'kip-met-rijst');
		seedStock(db, 'Kipfilet'); // already in stock -> dropped from the list

		const res = (await executeToolCall(
			'generate_shopping_list',
			{ week_start_date: WEEK },
			db,
			1,
			turnCtx()
		)) as ShoppingResult;

		expect(res.week).toBe(WEEK);
		// Names come back lowercased (the executor's dedup key doubles as the
		// output name) — current behavior, asserted as-is.
		expect(res.shopping_list).toEqual([{ name: 'rijst', amount: '200', unit: 'g' }]);
		expect(res.meals_without_recipe).toEqual([]);
		expect(res.note).toBe('1 meals planned. 1 ingredients needed.');
	});

	it('matches stock on the exact name key, not substrings', async () => {
		const db = createTestDb();
		seedRecipe(db, 'rijst-recept', [{ name: 'Rijst', amount: '200', unit: 'g' }]);
		await planMeal(db, 'Rijstgerecht', 'rijst-recept');
		seedStock(db, 'Rijstazijn'); // must NOT mask "rijst"

		const res = (await executeToolCall(
			'generate_shopping_list',
			{ week_start_date: WEEK },
			db,
			1,
			turnCtx()
		)) as ShoppingResult;

		expect(res.shopping_list.map((i) => i.name)).toEqual(['rijst']);
	});

	it('deduplicates an ingredient shared by several planned recipes', async () => {
		const db = createTestDb();
		seedRecipe(db, 'recept-a', [{ name: 'Rijst', amount: '100', unit: 'g' }]);
		seedRecipe(db, 'recept-b', [{ name: 'Rijst', amount: '200', unit: 'g' }]);
		await planMeal(db, 'Gerecht A', 'recept-a');
		await planMeal(db, 'Gerecht B', 'recept-b');

		const res = (await executeToolCall(
			'generate_shopping_list',
			{ week_start_date: WEEK },
			db,
			1,
			turnCtx()
		)) as ShoppingResult;

		// One entry, not two. Note: amounts are NOT summed — the last recipe's
		// amount wins (current behavior; see Map overwrite in shopping.ts).
		expect(res.shopping_list.map((i) => i.name)).toEqual(['rijst']);
	});

	it('reports meals without a recipe separately', async () => {
		const db = createTestDb();
		await planMeal(db, 'Pizza van de zaak');

		const res = (await executeToolCall(
			'generate_shopping_list',
			{ week_start_date: WEEK },
			db,
			1,
			turnCtx()
		)) as ShoppingResult;

		expect(res.shopping_list).toEqual([]);
		expect(res.meals_without_recipe).toEqual(['Pizza van de zaak']);
	});

	it('defaults to the current week when no week is given', async () => {
		const db = createTestDb();
		const res = (await executeToolCall(
			'generate_shopping_list',
			{},
			db,
			1,
			turnCtx()
		)) as ShoppingResult;
		expect(res.week).toBe(isoWeekStart());
		expect(res.shopping_list).toEqual([]);
	});

	it('rejects malformed args with a clean error instead of throwing', async () => {
		const db = createTestDb();
		const res = (await executeToolCall(
			'generate_shopping_list',
			{ week_start_date: 123 },
			db,
			1,
			turnCtx()
		)) as ErrorResult;
		expect(res.error).toMatch(/^Invalid input for week_start_date/);
	});
});
