import { describe, expect, it } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { materializeShoppingWeek } from '$lib/server/shopping_entries';
import {
	applyShoppingRecipeChoice,
	saveRecipeIngredientDefault
} from '$lib/server/shopping_recipe_choice';

const WEEK = '2026-07-22';

function setup() {
	const db = createTestDb();
	const now = new Date();
	const recipe = db.insert(schema.recipes).values({
		slug: 'pasta', title: 'Pasta', servings: 4,
		ingredients: [{ id: 'pasta', name: 'pasta', amount: '400', unit: 'g', optional: true, substitutes: [{ name: 'penne' }] }],
		directions: [], ingredientsEn: [{ name: 'pasta' }], translationStatus: 'ready',
		cookModeJson: { version: 4, generation_id: 'before', baseline_servings: 4, prep_tasks: [], streams: [], steps: [] },
		createdAt: now, updatedAt: now
	}).returning().get();
	db.insert(schema.mealPlanMeals).values({ weekNumber: 30, weekStartDate: WEEK, dinner: 'Pasta', recipeSlug: recipe.slug, servings: 4, sortOrder: 0, createdAt: now }).run();
	materializeShoppingWeek(db, WEEK, { weekStartDay: 2, today: WEEK });
	return { db, recipe, entry: db.select().from(schema.shoppingWeekEntries).get()! };
}

describe('shopping recipe choice', () => {
	it('saves a Dutch canonical substitute even when English display data exists', () => {
		const db = createTestDb();
		const now = new Date();
		const recipe = db
			.insert(schema.recipes)
			.values({
				slug: 'english-view',
				title: 'Pasta',
				ingredients: [
					{
						id: 'pasta',
						name: 'pasta',
						amount: '400',
						substitutes: [{ name: 'volkoren pasta' }]
					}
				],
				ingredientsEn: [
					{ name: 'pasta', substitutes: [{ name: 'whole-wheat pasta' }] }
				],
				translationStatus: 'ready',
				createdAt: now,
				updatedAt: now
			})
			.returning()
			.get();
		const updated = saveRecipeIngredientDefault(db, {
			recipeSlug: recipe.slug,
			ingredientId: 'pasta',
			substituteIndex: 0,
			expectedRecipeRevision: recipe.contentRevision
		});
		expect(updated.ingredients[0].name).toBe('volkoren pasta');
		expect(updated.ingredients[0].substitutes?.[0].name).toBe('pasta');
		expect(updated.ingredientsEn).toBeNull();
	});

	it('swaps a saved Dutch alternative through one revision-checked boundary', () => {
		const { db, recipe, entry } = setup();
		applyShoppingRecipeChoice(db, { entryId: entry.id, expectedEntryRevision: entry.revision, expectedRecipeRevision: recipe.contentRevision, need: 'required', term: 'penne', useInRecipe: true, actor: 'test', userId: 1 });
		const updated = db.select().from(schema.recipes).get()!;
		expect(updated.contentRevision).toBe(recipe.contentRevision + 1);
		expect(updated.ingredients[0]).toMatchObject({ name: 'penne', optional: false, substitutes: [{ name: 'pasta' }] });
		expect(updated.ingredientsEn).toBeNull();
		expect(updated.cookModeJson).toBeNull();
		expect(db.select().from(schema.shoppingWeekEntries).get()).toMatchObject({ name: 'penne', selectedName: null, included: true });
	});

	it('rejects a stale recipe revision without changing either owner', () => {
		const { db, recipe, entry } = setup();
		expect(() => applyShoppingRecipeChoice(db, { entryId: entry.id, expectedEntryRevision: entry.revision, expectedRecipeRevision: recipe.contentRevision + 1, need: 'required', term: 'pasta', useInRecipe: false, actor: 'test', userId: 1 })).toThrow('Recipe changed');
		expect(db.select().from(schema.recipes).get()?.ingredients[0].optional).toBe(true);
	});

	it('rejects a captured past week before changing the recipe', () => {
		const { db, recipe, entry } = setup();
		db.update(schema.shoppingWeekEntries).set({ weekStartDate: '2026-07-15' }).run();
		expect(() => applyShoppingRecipeChoice(db, {
			entryId: entry.id, expectedEntryRevision: entry.revision,
			expectedRecipeRevision: recipe.contentRevision, need: 'required', term: 'pasta',
			useInRecipe: false, actor: 'test', userId: 1
		})).toThrow('past shopping weeks');
		expect(db.select().from(schema.recipes).get()?.ingredients[0].optional).toBe(true);
	});

	it('updates the need on every captured nonpast week for the recipe source', () => {
		const { db, recipe, entry } = setup();
		const laterWeek = '2026-07-29';
		db.insert(schema.mealPlanMeals).values({
			weekNumber: 31, weekStartDate: laterWeek, dinner: 'Pasta', recipeSlug: recipe.slug,
			servings: 4, sortOrder: 0, createdAt: new Date()
		}).run();
		materializeShoppingWeek(db, laterWeek, { weekStartDay: 2, today: WEEK });

		applyShoppingRecipeChoice(db, {
			entryId: entry.id, expectedEntryRevision: entry.revision,
			expectedRecipeRevision: recipe.contentRevision, need: 'required', term: 'pasta',
			useInRecipe: false, actor: 'test', userId: 1
		});

		expect(db.select().from(schema.shoppingWeekEntries).all()).toHaveLength(2);
		expect(db.select().from(schema.shoppingWeekEntries).all().every((row) => row.included)).toBe(true);
	});

	it('stores a usually-stocked choice in inventory and can reverse a canonical swap', () => {
		const { db, recipe, entry } = setup();
		const stocked = applyShoppingRecipeChoice(db, {
			entryId: entry.id, expectedEntryRevision: entry.revision,
			expectedRecipeRevision: recipe.contentRevision, need: 'stocked', term: 'pasta',
			useInRecipe: false, actor: 'test', userId: 1
		});
		expect(db.select().from(schema.inventoryItems).get()).toMatchObject({ name: 'pasta', isStaple: true });
		expect(db.select().from(schema.shoppingWeekEntries).get()).toMatchObject({ included: false });

		const currentEntry = db.select().from(schema.shoppingWeekEntries).get()!;
		const swapped = applyShoppingRecipeChoice(db, {
			entryId: currentEntry.id, expectedEntryRevision: currentEntry.revision,
			expectedRecipeRevision: stocked.recipeRevision, need: 'required', term: 'penne',
			useInRecipe: true, actor: 'test', userId: 1
		});
		const reversedEntry = db.select().from(schema.shoppingWeekEntries).get()!;
		applyShoppingRecipeChoice(db, {
			entryId: reversedEntry.id, expectedEntryRevision: reversedEntry.revision,
			expectedRecipeRevision: swapped.recipeRevision, need: 'required', term: 'pasta',
			useInRecipe: true, actor: 'test', userId: 1
		});
		expect(db.select().from(schema.recipes).get()!.ingredients[0]).toMatchObject({ name: 'pasta', substitutes: [{ name: 'penne' }] });
	});
});
