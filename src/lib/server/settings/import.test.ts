import { describe, expect, it } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '../test_db';
import { importBootstrap, isBootstrapEligible, validateImportFile } from './import';

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
