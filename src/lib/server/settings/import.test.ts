import { describe, expect, it } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '../test_db';
import { importBootstrap, isBootstrapEligible, validateImportFile } from './import';
import { getHouseholdPref, setHouseholdPref } from '$lib/server/db/household_prefs';
import {
	initializeShoppingSourceData,
	K_SHOPPING_SOURCE_MIGRATION
} from '$lib/server/shopping_entries';

const NOW = new Date().toISOString();

function baseRecipe(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		slug: 'stamppot',
		title: 'Stamppot',
		category: null,
		tags: [],
		servings: null,
		totalTimeMin: null,
		sourceUrl: null,
		imageUrl: null,
		ingredients: [{ name: 'boerenkool', amount: '500', unit: 'g' }],
		directions: ['Kook', 'Stamp'],
		notes: null,
		rating: null,
		cuisine: null,
		language: 'nl',
		titleEn: null,
		categoryEn: null,
		cuisineEn: null,
		notesEn: null,
		ingredientsEn: null,
		directionsEn: null,
		translationStatus: 'pending',
		translatedAt: null,
		lastCookedAt: null,
		cookedCount: 0,
		cookModeJson: null,
		cookModeGeneratedAt: null,
		isFreezerStaple: false,
		targetPortions: null,
		freezerStapleOptOut: false,
		needsReview: false,
		reviewReason: null,
		createdAt: NOW,
		updatedAt: NOW,
		...overrides
	};
}

function baseInventoryItem(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		name: 'Kipfilet',
		qtyText: null,
		qtyNum: 2,
		unit: 'stuks',
		section: 'freezer',
		category: null,
		kind: null,
		foodClass: null,
		madeFromRecipeId: null,
		recipeStatus: null,
		recipeStatusAt: null,
		needsReview: false,
		reviewReason: null,
		isStaple: false,
		expiryDate: null,
		tags: [],
		createdAt: NOW,
		updatedAt: NOW,
		deletedAt: null,
		...overrides
	};
}

function emptyFile(overrides: Record<string, unknown> = {}) {
	return {
		exported_at: NOW,
		inventory: [],
		recipes: [],
		meal_plan: [],
		meal_log: [],
		meal_sub_recipes: [],
		shopping_overrides: [],
		recurring_shopping_items: [],
		shopping_week_entries: [],
		...overrides
	};
}

describe('validateImportFile', () => {
	it('accepts a well-formed empty file', () => {
		const result = validateImportFile(emptyFile());
		expect(result.ok).toBe(true);
	});

	it('accepts a well-formed file with recipes + inventory', () => {
		const result = validateImportFile(
			emptyFile({ recipes: [baseRecipe()], inventory: [baseInventoryItem({ madeFromRecipeId: 1 })] })
		);
		expect(result.ok).toBe(true);
	});

	it('rejects malformed shape', () => {
		const result = validateImportFile({ recipes: 'not-an-array' });
		expect(result.ok).toBe(false);
	});

	it('rejects an unparseable timestamp', () => {
		const result = validateImportFile(emptyFile({ recipes: [baseRecipe({ createdAt: 'not-a-date' })] }));
		expect(result.ok).toBe(false);
	});

	it('rejects duplicate recipe ids', () => {
		const result = validateImportFile(
			emptyFile({ recipes: [baseRecipe({ id: 1, slug: 'a' }), baseRecipe({ id: 1, slug: 'b' })] })
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/duplicate recipe id/i);
	});

	it('rejects duplicate recipe slugs', () => {
		const result = validateImportFile(
			emptyFile({ recipes: [baseRecipe({ id: 1, slug: 'a' }), baseRecipe({ id: 2, slug: 'a' })] })
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/duplicate recipe slug/i);
	});

	it('rejects an inventory item referencing a missing recipe id', () => {
		const result = validateImportFile(emptyFile({ inventory: [baseInventoryItem({ madeFromRecipeId: 999 })] }));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/missing recipe id/i);
	});

	it('rejects a meal_sub_recipes row referencing a missing recipe id', () => {
		const result = validateImportFile(
			emptyFile({
				recipes: [baseRecipe({ id: 1 })],
				meal_sub_recipes: [{ id: 1, mealRecipeId: 1, subRecipeId: 999, sortOrder: 0, createdAt: NOW }]
			})
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/missing sub recipe id/i);
	});

	it('coerces ISO timestamps into Date objects', () => {
		const result = validateImportFile(emptyFile({ recipes: [baseRecipe()] }));
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data.recipes[0].createdAt).toBeInstanceOf(Date);
	});

	it('keeps legacy exports compatible and rejects required AI suggestions', () => {
		const legacy = validateImportFile(emptyFile({ recipes: [baseRecipe()] }));
		expect(legacy.ok).toBe(true);
		if (legacy.ok) {
			expect(legacy.data.recipes[0].scalingMode).toBe('scalable');
			expect(legacy.data.recipes[0].structureVersion).toBe(1);
			expect(legacy.data.recipes[0].contentRevision).toBe(1);
			expect(legacy.data.recipes[0].directionIdsJson).toHaveLength(2);
			expect(legacy.data.recipes[0].sourceSnapshotJson?.provenance).toBe('legacy_baseline');
		}

		const invalid = validateImportFile(emptyFile({
			recipes: [baseRecipe({ ingredients: [{ name: 'kroepoek', amount: '1', origin: 'ai_suggested' }] })]
		}));
		expect(invalid.ok).toBe(false);
	});

	it('round-trips source snapshots and direction IDs', () => {
		const snapshot = {
			version: 1 as const,
			provenance: 'imported_source' as const,
			capturedAt: 123,
			title: 'Bron',
			servings: 2,
			sourceUrl: 'https://example.test/bron',
			ingredients: [{ id: 'ui', name: 'ui', amount: '1' }],
			directions: ['Snijd.']
		};
		const validation = validateImportFile(
			emptyFile({
				recipes: [
					baseRecipe({
						directions: ['Snijd.'],
						directionIdsJson: ['dir-source'],
						sourceSnapshotJson: snapshot
					})
				]
			})
		);
		expect(validation.ok).toBe(true);
		if (!validation.ok) return;
		const db = createTestDb();
		expect(importBootstrap(db, validation.data).ok).toBe(true);
		expect(db.select().from(schema.recipes).get()).toMatchObject({
			directionIdsJson: ['dir-source'],
			sourceSnapshotJson: snapshot
		});
	});

	it('restores trusted ingredient provenance and future fields', () => {
		const validation = validateImportFile(
			emptyFile({
				recipes: [
					baseRecipe({
						contentRevision: 7,
						ingredients: [
							{
								id: 'ingredient-7',
								name: 'Parmezaan',
								amount: '50',
								origin: 'ai_accepted',
								futureField: 'keep',
								substitutes: [{ name: 'Pecorino', futureField: 'keep-nested' }]
							}
						]
					})
				]
			})
		);
		expect(validation.ok).toBe(true);
		if (!validation.ok) return;

		const db = createTestDb();
		expect(importBootstrap(db, validation.data).ok).toBe(true);
		const restored = db.select().from(schema.recipes).get()!;
		expect(restored.contentRevision).toBe(7);
		expect(restored.ingredients).toEqual([
			{
				id: 'ingredient-7',
				name: 'Parmezaan',
				amount: '50',
				origin: 'ai_accepted',
				futureField: 'keep',
				substitutes: [{ name: 'Pecorino', futureField: 'keep-nested' }]
			}
		]);
	});
});

describe('isBootstrapEligible / importBootstrap', () => {
	it('is eligible on a fresh db', () => {
		const db = createTestDb();
		expect(isBootstrapEligible(db)).toBe(true);
	});

	it('imports recipes, meal_sub_recipes, and inventory in FK-safe order', () => {
		const db = createTestDb();
		const validation = validateImportFile(
			emptyFile({
				recipes: [baseRecipe({ id: 1, slug: 'taco-avond' }), baseRecipe({ id: 2, slug: 'gehakt-vulling' })],
				meal_sub_recipes: [{ id: 1, mealRecipeId: 1, subRecipeId: 2, sortOrder: 0, createdAt: NOW }],
				inventory: [baseInventoryItem({ id: 1, madeFromRecipeId: 2 })]
			})
		);
		expect(validation.ok).toBe(true);
		if (!validation.ok) return;

		const outcome = importBootstrap(db, validation.data);
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.inserted.recipes).toBe(2);
		expect(outcome.inserted.meal_sub_recipes).toBe(1);
		expect(outcome.inserted.inventory_items).toBe(1);

		expect(db.select().from(schema.recipes).all()).toHaveLength(2);
		expect(db.select().from(schema.mealSubRecipes).all()).toHaveLength(1);
		expect(db.select().from(schema.inventoryItems).all()[0].madeFromRecipeId).toBe(2);
	});

	it('preserves original ids rather than reassigning them', () => {
		const db = createTestDb();
		const validation = validateImportFile(emptyFile({ recipes: [baseRecipe({ id: 42, slug: 'stamppot' })] }));
		expect(validation.ok).toBe(true);
		if (!validation.ok) return;
		importBootstrap(db, validation.data);
		expect(db.select().from(schema.recipes).all()[0].id).toBe(42);
	});

	it('round-trips occasion servings and weekly shopping choices', () => {
		const db = createTestDb();
		setHouseholdPref(db, K_SHOPPING_SOURCE_MIGRATION, 'complete');
		const validation = validateImportFile(emptyFile({
			meal_plan: [{
				id: 4,
				weekNumber: 30,
				weekStartDate: '2026-07-22',
				dinner: 'Curry',
				recipeSlug: null,
				servings: 6,
				status: 'planned',
				source: 'fresh',
				cookedDate: null,
				plannedDate: null,
				note: null,
				sortOrder: 0,
				createdAt: NOW
			}],
			shopping_overrides: [{
				id: 9,
				weekStartDate: '2026-07-22',
				name: 'kikkererwten',
				bought: false,
				manual: false,
				amount: '2',
				unit: 'blik',
				included: false,
				selectedName: 'linzen',
				createdAt: NOW
			}]
		}));
		expect(validation.ok).toBe(true);
		if (!validation.ok) return;
		const outcome = importBootstrap(db, validation.data);
		expect(outcome.ok).toBe(true);
		expect(getHouseholdPref(db, K_SHOPPING_SOURCE_MIGRATION)).toBeNull();
		expect(initializeShoppingSourceData(db).imported).toMatchObject({ total: 1, unmatched: 1 });
		expect(initializeShoppingSourceData(db).alreadyComplete).toBe(true);
		expect(db.select().from(schema.mealPlanMeals).get()?.servings).toBe(6);
		expect(db.select().from(schema.shoppingListOverrides).get()).toMatchObject({ included: false, selectedName: 'linzen' });
		expect(db.select().from(schema.shoppingWeekEntries).all().filter((entry) => entry.sourceKind === 'legacy'))
			.toHaveLength(1);
	});

	it('round-trips recurring items and captured source entries', () => {
		const validation = validateImportFile(
			emptyFile({
				recurring_shopping_items: [
					{
						id: 5,
						name: 'melk',
						amount: '2',
						unit: 'pak',
						startWeek: '2026-07-22',
						endWeek: null,
						revision: 1,
						createdAt: NOW,
						updatedAt: NOW
					}
				],
				shopping_week_entries: [
					{
						id: 8,
						weekStartDate: '2026-07-22',
						sourceKey: 'weekly:5',
						sourceKind: 'weekly',
						recipeId: null,
						recipeSlug: null,
						ingredientId: null,
						recurringItemId: 5,
						legacyOverrideId: null,
						name: 'melk',
						amount: '2',
						unit: 'pak',
						component: null,
						mealIds: [],
						approvedTerms: ['melk'],
						included: false,
						selectedName: null,
						bought: true,
						needsReview: false,
						retiredAt: null,
						resolvedAt: null,
						resolution: null,
						resolvedSourceKey: null,
						revision: 2,
						createdAt: NOW,
						updatedAt: NOW
					}
				]
			})
		);
		expect(validation.ok).toBe(true);
		if (!validation.ok) return;
		const db = createTestDb();
		const outcome = importBootstrap(db, validation.data);
		expect(outcome.ok).toBe(true);
		expect(db.select().from(schema.recurringShoppingItems).get()).toMatchObject({ id: 5, name: 'melk' });
		expect(db.select().from(schema.shoppingWeekEntries).get()).toMatchObject({
			id: 8,
			sourceKey: 'weekly:5',
			included: false,
			bought: true
		});
	});

	it('refuses to import when recipes already exist, touching zero rows', () => {
		const db = createTestDb();
		db.insert(schema.recipes).values({ slug: 'existing', title: 'Existing', createdAt: new Date(), updatedAt: new Date() }).run();

		const validation = validateImportFile(emptyFile({ recipes: [baseRecipe({ id: 1, slug: 'new-recipe' })] }));
		expect(validation.ok).toBe(true);
		if (!validation.ok) return;

		const outcome = importBootstrap(db, validation.data);
		expect(outcome.ok).toBe(false);
		// Only the pre-existing seed recipe — the import must not have applied.
		expect(db.select().from(schema.recipes).all()).toHaveLength(1);
	});
});
