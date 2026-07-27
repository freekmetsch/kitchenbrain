import { describe, expect, it, vi } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { createMealCompositionService } from './meal-composition';

function seedRecipe(
	db: ReturnType<typeof createTestDb>,
	slug: string,
	title = slug
) {
	const now = new Date('2026-01-01T00:00:00.000Z');
	return db
		.insert(schema.recipes)
		.values({
			slug,
			title,
			servings: 4,
			ingredients: [],
			directions: [],
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();
}

function createService(db: ReturnType<typeof createTestDb>) {
	return createMealCompositionService(db, {
		reconcileShopping: vi.fn(),
		kickCookModeGeneration: vi.fn()
	});
}

describe('meal-composition workflow', () => {
	it('does not create a meal when one of the requested sub-recipes is missing', () => {
		const db = createTestDb();
		seedRecipe(db, 'soep');
		const service = createService(db);

		expect(
			service.create({ title: 'Soep met brood', subRecipeSlugs: ['soep', 'brood'] })
		).toEqual({ found: false });
		expect(db.select().from(schema.recipes).all()).toHaveLength(1);
		expect(db.select().from(schema.mealSubRecipes).all()).toHaveLength(0);
	});

	it('rolls back a composition change when shopping reconciliation fails', () => {
		const db = createTestDb();
		seedRecipe(db, 'soep');
		seedRecipe(db, 'brood');
		seedRecipe(db, 'salade');
		const created = createService(db).create({
			title: 'Soepmaaltijd',
			subRecipeSlugs: ['soep', 'brood']
		});
		if (!created.found) throw new Error('expected meal to be created');
		const kickCookModeGeneration = vi.fn();
		const service = createMealCompositionService(db, {
			reconcileShopping: () => {
				throw new Error('injected reconciliation fault');
			},
			kickCookModeGeneration
		});

		expect(() =>
			service.change({
				mealSlug: created.meal.slug,
				targetSlug: 'salade',
				action: 'add'
			})
		).toThrow('injected reconciliation fault');
		expect(
			service
				.getComponents(created.meal.id)
				.map((recipe) => recipe.slug)
				.sort()
		).toEqual(['brood', 'soep']);
		expect(
			db.select().from(schema.recipes).all().find((recipe) => recipe.id === created.meal.id)
				?.contentRevision
		).toBe(created.meal.contentRevision);
		expect(kickCookModeGeneration).not.toHaveBeenCalled();
	});
});
