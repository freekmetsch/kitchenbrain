import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { createRecipeMetadataService } from './recipe-metadata';

function seedRecipe(db: ReturnType<typeof createTestDb>) {
	const now = new Date('2026-01-01T00:00:00.000Z');
	return db
		.insert(schema.recipes)
		.values({
			slug: 'soep',
			title: 'Soep',
			ingredients: [],
			directions: [],
			needsReview: true,
			reviewReason: 'Check portions',
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();
}

describe('recipe-metadata workflow', () => {
	it('returns null when the recipe does not exist', () => {
		const db = createTestDb();
		const service = createRecipeMetadataService(db);

		expect(service.patch('missing', { dismissReview: true })).toBeNull();
		expect(db.select().from(schema.recipes).all()).toHaveLength(0);
	});

	it('rolls back freezer and review metadata together when either update fails', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		const service = createRecipeMetadataService(db);
		db.run(sql.raw(`
			CREATE TRIGGER fail_review_dismissal
			BEFORE UPDATE OF needs_review ON recipes
			WHEN NEW.needs_review = 0
			BEGIN
				SELECT RAISE(ABORT, 'injected metadata failure');
			END
		`));

		expect(() =>
			service.patch(recipe.slug, {
				isFreezerStaple: true,
				targetPortions: 6,
				dismissReview: true
			})
		).toThrow('injected metadata failure');
		expect(service.patch(recipe.slug, {})).toMatchObject({
			isFreezerStaple: false,
			targetPortions: null,
			needsReview: true
		});
	});
});
