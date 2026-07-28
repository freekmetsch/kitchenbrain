import { describe, expect, it } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { upsertRecipeAhPreference } from './commands';

describe('recipe AH preferences', () => {
	it('replaces one recipe ingredient preference without creating a duplicate row', () => {
		const db = createTestDb();
		const recipe = db
			.insert(schema.recipes)
			.values({
				slug: 'preference-pasta',
				title: 'Preference pasta',
				ingredients: [{ id: 'parmesan', name: 'Parmezaanse kaas', amount: '50', unit: 'g' }],
				directions: ['Kook.'],
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.returning()
			.get();

		upsertRecipeAhPreference(db, {
			recipeId: recipe.id,
			ingredientId: 'parmesan',
			productId: 'grated',
			productName: 'Geraspt',
			variantLabel: 'Vers geraspt',
			selectedAt: new Date('2026-07-28T12:00:00.000Z')
		});
		upsertRecipeAhPreference(db, {
			recipeId: recipe.id,
			ingredientId: 'parmesan',
			productId: 'block',
			productName: 'Heel stuk',
			variantLabel: 'Heel stuk',
			selectedAt: new Date('2026-07-28T12:05:00.000Z')
		});

		expect(db.select().from(schema.recipeAhPreferences).all()).toMatchObject([
			{
				recipeId: recipe.id,
				ingredientId: 'parmesan',
				productId: 'block',
				productName: 'Heel stuk',
				variantLabel: 'Heel stuk'
			}
		]);
	});
});
