import { describe, expect, it, vi } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { createRecipeEditService } from './recipe-edit';

function seedRecipe(db: ReturnType<typeof createTestDb>) {
	const now = new Date('2026-01-01T00:00:00.000Z');
	return db
		.insert(schema.recipes)
		.values({
			slug: 'soep',
			title: 'Soep',
			ingredients: [{ name: 'ui', amount: '1' }],
			directions: ['Snijd de ui.'],
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();
}

describe('recipe-edit workflow', () => {
	it('rejects a stale revision without reconciling shopping', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		const reconcileShopping = vi.fn();
		const service = createRecipeEditService(db, { reconcileShopping });

		expect(
			service.save({
				recipeId: recipe.id,
				expectedRevision: recipe.contentRevision + 1,
				changes: { title: 'Nieuwe soep' },
				reconcileShopping: true
			})
		).toBeUndefined();
		expect(service.get(recipe.slug)?.title).toBe('Soep');
		expect(reconcileShopping).not.toHaveBeenCalled();
	});

	it('rolls back the canonical edit when shopping reconciliation fails', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		const service = createRecipeEditService(db, {
			reconcileShopping: () => {
				throw new Error('injected reconciliation fault');
			}
		});

		expect(() =>
			service.save({
				recipeId: recipe.id,
				expectedRevision: recipe.contentRevision,
				changes: { title: 'Nieuwe soep' },
				reconcileShopping: true
			})
		).toThrow('injected reconciliation fault');
		expect(service.get(recipe.slug)).toMatchObject({
			title: 'Soep',
			contentRevision: recipe.contentRevision
		});
	});
});
