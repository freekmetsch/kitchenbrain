import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { addSubRecipe, removeSubRecipe } from '$lib/server/meal_recipes';
import { updateCanonicalRecipe, updateCookModeCache } from './recipe_mutations';

describe('updateCanonicalRecipe', () => {
	it('writes cook structure without changing canonical revision', () => {
		const db = createTestDb();
		const now = new Date();
		const recipe = db
			.insert(schema.recipes)
			.values({ slug: 'cache', title: 'Cache', createdAt: now, updatedAt: now })
			.returning()
			.get();
		const updated = updateCookModeCache(db, {
			recipeId: recipe.id,
			expectedRevision: recipe.contentRevision,
			cookModeJson: null,
			cookModeGeneratedAt: new Date(now.getTime() + 1)
		})!;
		expect(updated.contentRevision).toBe(recipe.contentRevision);
		expect(
			updateCookModeCache(db, {
				recipeId: recipe.id,
				expectedRevision: recipe.contentRevision + 1,
				cookModeJson: null,
				cookModeGeneratedAt: now
			})
		).toBeUndefined();
	});

	it('preserves direction identity through wording edits and reorder', () => {
		const db = createTestDb();
		const now = new Date();
		const recipe = db
			.insert(schema.recipes)
			.values({
				slug: 'direction-identity',
				title: 'Direction identity',
				directions: ['Snijd de ui.', 'Bak de ui.'],
				directionIdsJson: ['dir-a', 'dir-b'],
				createdAt: now,
				updatedAt: now
			})
			.returning()
			.get();
		const copyEdited = updateCanonicalRecipe(db, {
			recipeId: recipe.id,
			expectedRevision: recipe.contentRevision,
			changes: { directions: ['Snijd de rode ui.', 'Bak de ui.'] }
		})!;
		expect(copyEdited.directionIdsJson).toEqual(['dir-a', 'dir-b']);
		const reordered = updateCanonicalRecipe(db, {
			recipeId: recipe.id,
			expectedRevision: copyEdited.contentRevision,
			changes: { directions: ['Bak de ui.', 'Snijd de rode ui.'] }
		})!;
		expect(reordered.directionIdsJson).toEqual(['dir-b', 'dir-a']);
	});

	it('assigns distinct revisions to writes in the same clock tick and rejects stale writers', () => {
		const db = createTestDb();
		const fixedTime = new Date('2026-07-22T10:00:00.000Z');
		const recipe = db
			.insert(schema.recipes)
			.values({ slug: 'soep', title: 'Soep', createdAt: fixedTime, updatedAt: fixedTime })
			.returning()
			.get();

		const first = updateCanonicalRecipe(db, {
			recipeId: recipe.id,
			expectedRevision: 1,
			changes: { title: 'Tomatensoep' },
			now: fixedTime
		});
		const second = updateCanonicalRecipe(db, {
			recipeId: recipe.id,
			expectedRevision: 2,
			changes: { notes: 'Met basilicum' },
			now: fixedTime
		});
		const stale = updateCanonicalRecipe(db, {
			recipeId: recipe.id,
			expectedRevision: 1,
			changes: { notes: 'Oud' },
			now: fixedTime
		});

		expect(first?.contentRevision).toBe(2);
		expect(second?.contentRevision).toBe(3);
		expect(stale).toBeUndefined();
		expect(
			db.select().from(schema.recipes).where(eq(schema.recipes.id, recipe.id)).get()
		).toMatchObject({ title: 'Tomatensoep', notes: 'Met basilicum', contentRevision: 3 });
	});

	it('leaves the revision alone for image and cache-only writes', () => {
		const db = createTestDb();
		const now = new Date();
		const recipe = db
			.insert(schema.recipes)
			.values({ slug: 'curry', title: 'Curry', createdAt: now, updatedAt: now })
			.returning()
			.get();

		db.update(schema.recipes)
			.set({ imageUrl: '/recipe-images/curry.webp', cookModeGeneratedAt: now })
			.where(eq(schema.recipes.id, recipe.id))
			.run();

		expect(
			db.select({ revision: schema.recipes.contentRevision }).from(schema.recipes).where(eq(schema.recipes.id, recipe.id)).get()
		).toEqual({ revision: 1 });
	});
});

describe('migration 0019 compatibility', () => {
	it('adds only the revision column and remains writable by the previous release', () => {
		const sqlite = new Database(':memory:');
		sqlite.exec(`
			CREATE TABLE recipes (
				id integer PRIMARY KEY AUTOINCREMENT,
				slug text NOT NULL UNIQUE,
				title text NOT NULL,
				ingredients text NOT NULL DEFAULT '[]'
			);
		`);
		const ingredientJson = JSON.stringify([
			{ name: 'Basilicum', amount: '1', optional: true, origin: 'ai_suggested' }
		]);
		sqlite
			.prepare('INSERT INTO recipes (slug, title, ingredients) VALUES (?, ?, ?)')
			.run('pasta', 'Pasta', ingredientJson);

		const migration = readFileSync(
			path.join(process.cwd(), 'drizzle', '0019_red_the_phantom.sql'),
			'utf8'
		);
		sqlite.exec(migration);
		const migrated = sqlite
			.prepare('SELECT ingredients, content_revision FROM recipes WHERE slug = ?')
			.get('pasta') as { ingredients: string; content_revision: number };
		expect(migrated).toEqual({ ingredients: ingredientJson, content_revision: 1 });

		// A pre-Release-A writer ignores the additive column and still succeeds.
		sqlite.prepare('UPDATE recipes SET title = ? WHERE slug = ?').run('Pasta oud', 'pasta');
		expect(
			sqlite.prepare('SELECT title, content_revision FROM recipes WHERE slug = ?').get('pasta')
		).toEqual({ title: 'Pasta oud', content_revision: 1 });
		sqlite.close();
	});
});

describe('meal composition revision rollback', () => {
	it('rolls back added links when the conditional recipe update fails', () => {
		const db = createTestDb();
		const now = new Date();
		const [meal, sub] = db
			.insert(schema.recipes)
			.values([
				{ slug: 'meal', title: 'Meal', createdAt: now, updatedAt: now },
				{ slug: 'sub', title: 'Sub', createdAt: now, updatedAt: now }
			])
			.returning()
			.all();

		expect(() =>
			db.transaction((tx) => {
				addSubRecipe(tx, meal.id, sub.id);
				const updated = updateCanonicalRecipe(tx, {
					recipeId: meal.id,
					expectedRevision: 99,
					changes: { cookModeJson: null }
				});
				if (!updated) throw new Error('stale revision');
			})
		).toThrow('stale revision');
		expect(db.select().from(schema.mealSubRecipes).all()).toEqual([]);
	});

	it('restores removed links and sort order when the conditional update fails', () => {
		const db = createTestDb();
		const now = new Date();
		const [meal, first, second] = db
			.insert(schema.recipes)
			.values([
				{ slug: 'meal', title: 'Meal', createdAt: now, updatedAt: now },
				{ slug: 'first', title: 'First', createdAt: now, updatedAt: now },
				{ slug: 'second', title: 'Second', createdAt: now, updatedAt: now }
			])
			.returning()
			.all();
		addSubRecipe(db, meal.id, first.id);
		addSubRecipe(db, meal.id, second.id);

		expect(() =>
			db.transaction((tx) => {
				removeSubRecipe(tx, meal.id, first.id);
				const updated = updateCanonicalRecipe(tx, {
					recipeId: meal.id,
					expectedRevision: 99,
					changes: { cookModeJson: null }
				});
				if (!updated) throw new Error('stale revision');
			})
		).toThrow('stale revision');
		expect(
			db
				.select({ subRecipeId: schema.mealSubRecipes.subRecipeId, sortOrder: schema.mealSubRecipes.sortOrder })
				.from(schema.mealSubRecipes)
				.orderBy(schema.mealSubRecipes.sortOrder)
				.all()
		).toEqual([
			{ subRecipeId: first.id, sortOrder: 0 },
			{ subRecipeId: second.id, sortOrder: 1 }
		]);
	});
});
