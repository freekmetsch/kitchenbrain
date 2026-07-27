import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { updateCanonicalRecipe, updateCookModeCache } from './commands';

function seedRecipe(db: ReturnType<typeof createTestDb>) {
	const now = new Date('2026-01-01T00:00:00.000Z');
	return db
		.insert(schema.recipes)
		.values({
			slug: 'soep',
			title: 'Soep',
			ingredients: [{ name: 'ui', amount: '1' }],
			directions: ['Snijd de ui.'],
			directionIdsJson: ['direction_1'],
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();
}

describe('recipe commands', () => {
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
});
