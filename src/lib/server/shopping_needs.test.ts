// deriveWeekNeeds: the freezer-aware planned-meals → to-buy derivation shared
// by the shopping page and the generate_shopping_list executor.
import { describe, it, expect } from 'vitest';
import * as schema from '$lib/server/db/schema';
import type { Ingredient } from '$lib/server/db/schema';
import { createTestDb, type TestDb } from '$lib/server/test_db';
import { createMealRecipe } from '$lib/server/meal_recipes';
import { deriveWeekNeeds, type PlannedMealForNeeds } from './shopping_needs';

function seedRecipe(db: TestDb, slug: string, ingredients: Ingredient[]) {
	const now = new Date();
	return db
		.insert(schema.recipes)
		.values({ slug, title: slug, ingredients, directions: [], createdAt: now, updatedAt: now })
		.returning()
		.get();
}

const meal = (
	dinner: string,
	recipeSlug: string | null,
	source: 'fresh' | 'freezer' = 'fresh'
): PlannedMealForNeeds => ({ dinner, recipeSlug, source });

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

	it('reports meals without a recipe and dangling recipe slugs', () => {
		const db = createTestDb();

		const res = deriveWeekNeeds(db, [meal('Pizza bestellen', null), meal('Verdwenen', 'weg')]);

		expect(res.needed).toEqual([]);
		expect(res.mealsWithoutRecipe).toEqual(['Pizza bestellen', 'Verdwenen']);
	});
});
