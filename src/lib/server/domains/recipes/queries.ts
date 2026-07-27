import { eq, inArray, like, notInArray } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type { DbOrTx } from '$lib/server/db/types';

export type Recipe = typeof schema.recipes.$inferSelect;

export function getRecipeBySlug(db: DbOrTx, slug: string): Recipe | undefined {
	return db.select().from(schema.recipes).where(eq(schema.recipes.slug, slug)).get();
}

export function getRecipeById(db: DbOrTx, id: number): Recipe | undefined {
	return db.select().from(schema.recipes).where(eq(schema.recipes.id, id)).get();
}

export function findRecipeByTitle(db: DbOrTx, title: string): Recipe | undefined {
	return db.select().from(schema.recipes).where(like(schema.recipes.title, `%${title}%`)).get();
}

export function listRecipes(db: DbOrTx): Recipe[] {
	return db.select().from(schema.recipes).all();
}

export function getRecipesBySlugs(db: DbOrTx, slugs: string[]): Recipe[] {
	if (slugs.length === 0) return [];
	return db.select().from(schema.recipes).where(inArray(schema.recipes.slug, slugs)).all();
}

export function listMealCandidates(db: DbOrTx) {
	const mealIds = db
		.select({ id: schema.mealSubRecipes.mealRecipeId })
		.from(schema.mealSubRecipes)
		.all()
		.map((row) => row.id);
	return db
		.select({
			slug: schema.recipes.slug,
			title: schema.recipes.title,
			titleEn: schema.recipes.titleEn
		})
		.from(schema.recipes)
		.where(mealIds.length ? notInArray(schema.recipes.id, mealIds) : undefined)
		.all();
}
