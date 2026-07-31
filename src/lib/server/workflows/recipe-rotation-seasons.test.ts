import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import {
	createRecipeRotationSeasonService,
	parseRotationSeasonModelOutput,
	RotationSeasonConflict
} from './recipe-rotation-seasons';

function seedRecipe(db: ReturnType<typeof createTestDb>, slug: string) {
	const now = new Date('2026-07-31T10:00:00.000Z');
	return db
		.insert(schema.recipes)
		.values({ slug, title: slug, ingredients: [], directions: [], createdAt: now, updatedAt: now })
		.returning()
		.get();
}

describe('recipe rotation season bootstrap', () => {
	it('strictly validates ids, seasons, and duplicate proposals', () => {
		expect(() =>
			parseRotationSeasonModelOutput(
				{ proposals: [{ recipe_id: 9, seasons: ['winter'], reason: 'Stew' }] },
				new Set([1])
			)
		).toThrow(/unknown/i);
		expect(() =>
			parseRotationSeasonModelOutput(
				{
					proposals: [
						{ recipe_id: 1, seasons: ['winter'], reason: 'Stew' },
						{ recipe_id: 1, seasons: ['summer'], reason: 'Duplicate' }
					]
				},
				new Set([1])
			)
		).toThrow(/duplicate/i);
	});

	it('applies reviewed season tags without choosing cadence and supports guarded undo', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db, 'stoofpot');
		const service = createRecipeRotationSeasonService(db, vi.fn());

		const applied = service.apply([
			{ recipeId: recipe.id, seasons: ['winter'], expectedUpdatedAt: recipe.updatedAt.getTime() }
		]);
		expect(db.select().from(schema.recipes).get()).toMatchObject({
			rotationPolicy: null,
			rotationSeasonsJson: ['winter']
		});

		service.undo(applied.undo);
		expect(db.select().from(schema.recipes).get()).toMatchObject({
			rotationPolicy: null,
			rotationSeasonsJson: []
		});
	});

	it('rejects a stale batch atomically', () => {
		const db = createTestDb();
		const first = seedRecipe(db, 'first');
		const second = seedRecipe(db, 'second');
		const service = createRecipeRotationSeasonService(db, vi.fn());
		db.update(schema.recipes)
			.set({ updatedAt: new Date('2026-07-31T11:00:00.000Z') })
			.where(eq(schema.recipes.id, second.id))
			.run();

		expect(() =>
			service.apply([
				{ recipeId: first.id, seasons: ['spring'], expectedUpdatedAt: first.updatedAt.getTime() },
				{ recipeId: second.id, seasons: ['summer'], expectedUpdatedAt: second.updatedAt.getTime() }
			])
		).toThrow(RotationSeasonConflict);
		expect(db.select().from(schema.recipes).all().map((row) => row.rotationSeasonsJson)).toEqual([
			[],
			[]
		]);
	});
});
