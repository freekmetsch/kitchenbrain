import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import {
	archiveRecipe,
	restoreRecipe,
	updateCanonicalRecipe,
	updateCookModeCache
} from './commands';
import { getRecipeBySlug, listRecipePlanningOptions, listRecipes } from './queries';

function seedRecipe(db: ReturnType<typeof createTestDb>) {
	const now = new Date('2026-01-01T00:00:00.000Z');
	return db
		.insert(schema.recipes)
		.values({
			slug: 'soep',
			title: 'Soep',
			ingredients: [{ id: 'ingredient-ui', name: 'ui', amount: '1' }],
			directions: ['Snijd de ui.'],
			directionIdsJson: ['direction_1'],
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();
}

describe('recipe commands', () => {
	it('archives recipes out of active choices while preserving historical reads and restore', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);

		expect(archiveRecipe(db, recipe.id, new Date('2026-08-01T10:00:00Z'))?.archivedAt).toEqual(
			new Date('2026-08-01T10:00:00Z')
		);
		expect(listRecipes(db)).toEqual([]);
		expect(listRecipePlanningOptions(db)).toEqual([]);
		expect(getRecipeBySlug(db, recipe.slug)?.id).toBe(recipe.id);

		expect(restoreRecipe(db, recipe.id)?.archivedAt).toBeNull();
		expect(listRecipes(db)).toHaveLength(1);
		expect(listRecipePlanningOptions(db)).toHaveLength(1);
	});

	it('keeps canonical CAS and cache-only revision behavior inside a caller-owned transaction', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);

		db.transaction((tx) => {
			const cached = updateCookModeCache(tx, {
				recipeId: recipe.id,
				expectedRevision: recipe.contentRevision,
				cookModeJson: null,
				cookModeGeneratedAt: new Date('2026-01-02T00:00:00.000Z')
			});
			expect(cached?.contentRevision).toBe(recipe.contentRevision);

			const updated = updateCanonicalRecipe(tx, {
				recipeId: recipe.id,
				expectedRevision: recipe.contentRevision,
				changes: { directions: ['Snijd de ui fijn.'] }
			});
			expect(updated?.contentRevision).toBe(recipe.contentRevision + 1);
			expect(updated?.directionIdsJson).toEqual(['direction_1']);
		});

		expect(
			updateCanonicalRecipe(db, {
				recipeId: recipe.id,
				expectedRevision: recipe.contentRevision,
				changes: { title: 'Stale' }
			})
		).toBeUndefined();
		expect(
			db.select().from(schema.recipes).where(eq(schema.recipes.id, recipe.id)).get()?.title
		).toBe('Soep');
	});

	it('prunes recipe product preferences when canonical ingredients disappear', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		db.insert(schema.recipeAhPreferences)
			.values({
				recipeId: recipe.id,
				ingredientId: 'ingredient-ui',
				productId: 'ah-ui',
				productName: 'AH Ui',
				variantLabel: 'Los',
				selectedAt: new Date()
			})
			.run();

		db.transaction((tx) => {
			expect(
				updateCanonicalRecipe(tx, {
					recipeId: recipe.id,
					expectedRevision: recipe.contentRevision,
					changes: { ingredients: [] }
				})
			).toBeDefined();
		});

		expect(db.select().from(schema.recipeAhPreferences).all()).toEqual([]);
	});
});
