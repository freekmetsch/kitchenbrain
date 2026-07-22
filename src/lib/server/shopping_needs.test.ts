// deriveWeekNeeds: the freezer-aware planned-meals → to-buy derivation shared
// by the shopping page and the generate_shopping_list executor.
import { describe, it, expect } from 'vitest';
import * as schema from '$lib/server/db/schema';
import type { Ingredient } from '$lib/server/db/schema';
import { createTestDb, type TestDb } from '$lib/server/test_db';
import { createMealRecipe } from '$lib/server/meal_recipes';
import { deriveWeekNeeds, type PlannedMealForNeeds } from './shopping_needs';

function seedRecipe(db: TestDb, slug: string, ingredients: Ingredient[], servings: number | null = 4) {
	const now = new Date();
	return db
		.insert(schema.recipes)
		.values({ slug, title: slug, servings, ingredients, directions: [], createdAt: now, updatedAt: now })
		.returning()
		.get();
}

const meal = (
	dinner: string,
	recipeSlug: string | null,
	source: 'fresh' | 'freezer' = 'fresh',
	servings?: number | null
): PlannedMealForNeeds => ({ dinner, recipeSlug, source, servings });

const CURRY: Ingredient[] = [
	{ name: 'kipdijfilet', amount: '500', unit: 'g', role: 'cook_in' },
	{ name: 'currypasta', amount: '1', unit: 'potje', role: 'cook_in' },
	{ name: 'naan', amount: '4', role: 'serve_fresh' },
	{ name: 'limoen', amount: '2', role: 'serve_fresh' }
];

describe('deriveWeekNeeds', () => {
	it('fresh meals need their full (expanded) ingredient list', () => {
		const db = createTestDb();
		seedRecipe(db, 'curry', CURRY);

		const res = deriveWeekNeeds(db, [meal('Curry', 'curry')]);

		expect(res.needed.map((i) => i.name)).toEqual(['kipdijfilet', 'currypasta', 'naan', 'limoen']);
		expect(res.freezerMeals).toEqual([]);
		expect(res.needed.every((i) => !i.freshSideOnly)).toBe(true);
	});

	it('freezer meals only need their serve_fresh ingredients', () => {
		const db = createTestDb();
		seedRecipe(db, 'curry', CURRY);

		const res = deriveWeekNeeds(db, [meal('Curry (freezer)', 'curry', 'freezer')]);

		expect(res.needed.map((i) => i.name)).toEqual(['naan', 'limoen']);
		expect(res.needed.every((i) => i.freshSideOnly)).toBe(true);
		expect(res.freezerMeals).toEqual([{ dinner: 'Curry (freezer)', recipeSlug: 'curry' }]);
		expect(res.freezerMealsMissingFreshInfo).toEqual([]);
	});

	it('flags freezer meals whose recipe has no ingredient roles', () => {
		const db = createTestDb();
		seedRecipe(db, 'chili', [
			{ name: 'gehakt', amount: '500', unit: 'g' },
			{ name: 'bonen', amount: '1', unit: 'blik' }
		]);

		const res = deriveWeekNeeds(db, [meal('Chili', 'chili', 'freezer')]);

		// Without roles we can't tell salsa from beans — contribute nothing and flag it.
		expect(res.needed).toEqual([]);
		expect(res.freezerMealsMissingFreshInfo).toEqual([{ dinner: 'Chili', recipeSlug: 'chili' }]);
	});

	it('flags partial role coverage while keeping known fresh sides visible', () => {
		const db = createTestDb();
		seedRecipe(db, 'curry', [
			{ name: 'currypasta', amount: '1', unit: 'potje', role: 'cook_in' },
			{ name: 'naan', amount: '4', role: 'serve_fresh' },
			{ name: 'limoen', amount: '2' }
		]);

		const res = deriveWeekNeeds(db, [meal('Curry', 'curry', 'freezer')]);

		expect(res.needed.map((item) => item.name)).toEqual(['naan']);
		expect(res.freezerMealsMissingFreshInfo).toEqual([{ dinner: 'Curry', recipeSlug: 'curry' }]);
	});

	it('a shared ingredient loses freshSideOnly when a fresh meal also needs it', () => {
		const db = createTestDb();
		seedRecipe(db, 'curry', CURRY);
		seedRecipe(db, 'salade', [{ name: 'limoen', amount: '1' }]);

		const res = deriveWeekNeeds(db, [
			meal('Curry (freezer)', 'curry', 'freezer'),
			meal('Salade', 'salade')
		]);

		const limoen = res.needed.find((i) => i.name === 'limoen')!;
		expect(limoen.forMeals).toEqual(['Curry (freezer)', 'Salade']);
		expect(limoen.freshSideOnly).toBe(false);
	});

	it('expands meal recipes before role filtering (ADR 0003)', () => {
		const db = createTestDb();
		const mainDish = seedRecipe(db, 'taco-vlees', [
			{ name: 'gehakt', amount: '500', unit: 'g', role: 'cook_in' },
			{ name: 'koriander', amount: '1', unit: 'bosje', role: 'serve_fresh' }
		]);
		const side = seedRecipe(db, 'guacamole', [
			{ name: 'avocado', amount: '2', role: 'serve_fresh' }
		]);
		const taco = createMealRecipe(db, { title: 'Taco avond', subRecipeIds: [mainDish.id, side.id] });

		const res = deriveWeekNeeds(db, [meal('Taco avond', taco.slug, 'freezer')]);

		expect(res.needed.map((i) => i.name).sort()).toEqual(['avocado', 'koriander']);
	});

	it('treats complete sub-recipe-only roles as complete coverage', () => {
		const db = createTestDb();
		const mainDish = seedRecipe(db, 'taco-vlees', [
			{ name: 'gehakt', amount: '500', unit: 'g', role: 'cook_in' }
		]);
		const side = seedRecipe(db, 'guacamole', [
			{ name: 'avocado', amount: '2', role: 'serve_fresh' }
		]);
		const taco = createMealRecipe(db, { title: 'Taco avond', subRecipeIds: [mainDish.id, side.id] });

		const res = deriveWeekNeeds(db, [meal('Taco avond', taco.slug, 'freezer')]);

		expect(res.freezerMealsMissingFreshInfo).toEqual([]);
		expect(res.needed.map((item) => item.name)).toEqual(['avocado']);
	});

	it('reports meals without a recipe and dangling recipe slugs', () => {
		const db = createTestDb();

		const res = deriveWeekNeeds(db, [meal('Pizza bestellen', null), meal('Verdwenen', 'weg')]);

		expect(res.needed).toEqual([]);
		expect(res.mealsWithoutRecipe).toEqual(['Pizza bestellen', 'Verdwenen']);
	});

	it('projects planned servings exactly once and sums compatible shared ingredients', () => {
		const db = createTestDb();
		seedRecipe(db, 'curry', [{ name: 'rijst', amount: '400', unit: 'g' }], 4);

		const res = deriveWeekNeeds(db, [
			meal('Curry groot', 'curry', 'fresh', 6),
			meal('Curry klein', 'curry', 'fresh', 2)
		]);

		expect(res.needed).toHaveLength(1);
		expect(res.needed[0]).toMatchObject({ name: 'rijst', amount: '800', unit: 'g' });
	});

	it('projects each meal-recipe child from its own yield', () => {
		const db = createTestDb();
		const curry = seedRecipe(db, 'curry', [{ name: 'kip', amount: '200', unit: 'g' }], 2);
		const rice = seedRecipe(db, 'rice', [{ name: 'rijst', amount: '400', unit: 'g' }], 4);
		const combo = createMealRecipe(db, { title: 'Curry met rijst', subRecipeIds: [curry.id, rice.id] });

		const res = deriveWeekNeeds(db, [meal('Curry met rijst', combo.slug, 'fresh', 6)]);

		expect(res.needed.find((item) => item.name === 'kip')?.amount).toBe('600');
		expect(res.needed.find((item) => item.name === 'rijst')?.amount).toBe('600');
	});

	it('keeps optional choices and unsafe unit combinations explicit', () => {
		const db = createTestDb();
		seedRecipe(db, 'a', [{ name: 'tomaat', amount: '2', unit: 'stuk', optional: true, origin: 'ai_suggested', substitutes: [{ name: 'paprika' }] }]);
		seedRecipe(db, 'b', [{ name: 'tomaat', amount: '400', unit: 'g', optional: true }]);

		const [tomaat] = deriveWeekNeeds(db, [meal('A', 'a'), meal('B', 'b')]).needed;

		expect(tomaat).toMatchObject({ optional: true, incompatibleQuantities: true });
		expect(tomaat.amount).toBe('2 stuk + 400 g');
		expect(tomaat.substitutes).toEqual(['paprika']);
	});
});
