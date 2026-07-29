import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { materializeShoppingWeek } from './reconcile-shopping';
import {
	applyShoppingRecipeNeedChoice,
	applyShoppingRecipeTermChoice,
	saveRecipeIngredientDefault
} from './choose-shopping-source';

const WEEK = '2026-07-22';

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-07-27T12:00:00.000Z'));
});

afterEach(() => {
	vi.useRealTimers();
});

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

	it('changes only the selected Dutch term for this shopping run', () => {
		const { db, recipe, entry } = setup();
		db.insert(schema.inventoryItems).values({
			name: 'pasta',
			section: 'pantry',
			kind: 'ingredient',
			isStaple: true,
			createdAt: new Date(),
			updatedAt: new Date()
		}).run();

		const result = applyShoppingRecipeTermChoice(db, {
			entryId: entry.id,
			expectedEntryRevision: entry.revision,
			term: 'penne',
			actor: 'test',
			userId: 1
		});

		expect(result).toMatchObject({
			sourceKey: entry.sourceKey,
			entryId: entry.id,
			entryRevision: entry.revision + 1,
			recipeId: recipe.id,
			term: 'penne'
		});
		expect(db.select().from(schema.shoppingWeekEntries).get()).toMatchObject({
			name: 'pasta',
			selectedName: 'penne',
			included: false
		});
		expect(db.select().from(schema.recipes).get()).toMatchObject({
			contentRevision: recipe.contentRevision,
			ingredients: recipe.ingredients,
			ingredientsEn: recipe.ingredientsEn,
			cookModeJson: recipe.cookModeJson
		});
		expect(db.select().from(schema.inventoryItems).get()).toMatchObject({
			name: 'pasta',
			isStaple: true
		});
	});

	it('rejects invalid and stale term-only writes without touching the recipe', () => {
		const { db, recipe, entry } = setup();
		expect(() =>
			applyShoppingRecipeTermChoice(db, {
				entryId: entry.id,
				expectedEntryRevision: entry.revision,
				term: 'whole-wheat pasta',
				actor: 'test',
				userId: 1
			})
		).toThrow('Dutch recipe name');
		expect(() =>
			applyShoppingRecipeTermChoice(db, {
				entryId: entry.id,
				expectedEntryRevision: entry.revision + 1,
				term: 'penne',
				actor: 'test',
				userId: 1
			})
		).toThrow('Shopping source changed');
		expect(db.select().from(schema.recipes).get()?.contentRevision).toBe(recipe.contentRevision);
	});

	it('does not copy this-run term state or inclusion into another week', () => {
		const { db, entry } = setup();
		const laterWeek = '2026-07-29';
		db.insert(schema.shoppingWeekEntries).values({
			...entry,
			id: undefined,
			weekStartDate: laterWeek,
			included: true,
			selectedName: null,
			revision: 1
		}).run();

		applyShoppingRecipeTermChoice(db, {
			entryId: entry.id,
			expectedEntryRevision: entry.revision,
			term: 'penne',
			actor: 'test',
			userId: 1
		});

		const rows = db
			.select()
			.from(schema.shoppingWeekEntries)
			.orderBy(schema.shoppingWeekEntries.weekStartDate)
			.all();
		expect(rows[0]).toMatchObject({ selectedName: 'penne', included: false });
		expect(rows[1]).toMatchObject({ selectedName: null, included: true, revision: 1 });
	});

	it('rejects a captured past week before changing the recipe', () => {
		const { db, recipe, entry } = setup();
		db.update(schema.shoppingWeekEntries).set({ weekStartDate: '2026-07-15' }).run();
		expect(() => applyShoppingRecipeNeedChoice(db, {
			entryId: entry.id,
			expectedEntryRevision: entry.revision,
			expectedRecipeRevision: recipe.contentRevision,
			need: 'required',
			actor: 'test',
			userId: 1
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

		applyShoppingRecipeNeedChoice(db, {
			entryId: entry.id, expectedEntryRevision: entry.revision,
			expectedRecipeRevision: recipe.contentRevision, need: 'required',
			actor: 'test', userId: 1
		});

		expect(db.select().from(schema.shoppingWeekEntries).all()).toHaveLength(2);
		expect(db.select().from(schema.shoppingWeekEntries).all().every((row) => row.included)).toBe(true);
	});

	it('cycles nice-to-have, usually stocked, and always without changing the selected term', () => {
		const { db, recipe, entry } = setup();
		const term = applyShoppingRecipeTermChoice(db, {
			entryId: entry.id,
			expectedEntryRevision: entry.revision,
			term: 'penne',
			actor: 'test',
			userId: 1
		});
		const stocked = applyShoppingRecipeNeedChoice(db, {
			entryId: term.entryId,
			expectedEntryRevision: term.entryRevision,
			expectedRecipeRevision: recipe.contentRevision,
			need: 'stocked',
			actor: 'test',
			userId: 1
		});
		expect(db.select().from(schema.inventoryItems).get()).toMatchObject({ name: 'pasta', isStaple: true });
		expect(db.select().from(schema.shoppingWeekEntries).get()).toMatchObject({
			included: false,
			selectedName: 'penne'
		});
		expect(db.select().from(schema.recipes).get()?.ingredients[0]).toMatchObject({
			name: 'pasta',
			optional: false
		});

		const required = applyShoppingRecipeNeedChoice(db, {
			entryId: stocked.entryId,
			expectedEntryRevision: stocked.entryRevision,
			expectedRecipeRevision: stocked.recipeRevision,
			need: 'required',
			actor: 'test',
			userId: 1
		});
		expect(db.select().from(schema.inventoryItems).get()?.deletedAt).not.toBeNull();
		expect(db.select().from(schema.shoppingWeekEntries).get()).toMatchObject({
			included: true,
			selectedName: 'penne'
		});

		const optional = applyShoppingRecipeNeedChoice(db, {
			entryId: required.entryId,
			expectedEntryRevision: required.entryRevision,
			expectedRecipeRevision: required.recipeRevision,
			need: 'optional',
			actor: 'test',
			userId: 1
		});
		expect(optional.need).toBe('optional');
		expect(db.select().from(schema.shoppingWeekEntries).get()).toMatchObject({
			included: false,
			selectedName: 'penne'
		});
		expect(db.select().from(schema.recipes).get()?.ingredients[0]).toMatchObject({
			name: 'pasta',
			optional: true,
			substitutes: [{ name: 'penne' }]
		});
	});

	it('rejects a stale recipe revision without changing either owner', () => {
		const { db, recipe, entry } = setup();
		expect(() =>
			applyShoppingRecipeNeedChoice(db, {
				entryId: entry.id,
				expectedEntryRevision: entry.revision,
				expectedRecipeRevision: recipe.contentRevision + 1,
				need: 'required',
				actor: 'test',
				userId: 1
			})
		).toThrow('Recipe changed');
		expect(db.select().from(schema.recipes).get()?.ingredients[0].optional).toBe(true);
	});

	it('keeps real inventory quantity while clearing its usually-stocked flag', () => {
		const { db, recipe, entry } = setup();
		db.insert(schema.inventoryItems).values({
			name: 'pasta',
			qtyText: '1 bag',
			qtyNum: 1,
			unit: 'stuk',
			section: 'pantry',
			kind: 'ingredient',
			isStaple: true,
			createdAt: new Date(),
			updatedAt: new Date()
		}).run();

		applyShoppingRecipeNeedChoice(db, {
			entryId: entry.id,
			expectedEntryRevision: entry.revision,
			expectedRecipeRevision: recipe.contentRevision,
			need: 'required',
			actor: 'test',
			userId: 1
		});

		expect(db.select().from(schema.inventoryItems).get()).toMatchObject({
			qtyNum: 1,
			isStaple: false,
			deletedAt: null
		});
	});
});
