import { desc, eq, inArray, like, notInArray } from 'drizzle-orm';
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

export function listRecipePlanningOptions(db: DbOrTx) {
	return db
		.select({
			id: schema.recipes.id,
			slug: schema.recipes.slug,
			title: schema.recipes.title,
			titleEn: schema.recipes.titleEn,
			category: schema.recipes.category,
			categoryEn: schema.recipes.categoryEn,
			rating: schema.recipes.rating,
			servings: schema.recipes.servings,
			scalingMode: schema.recipes.scalingMode,
			targetPortions: schema.recipes.targetPortions,
			isFreezerStaple: schema.recipes.isFreezerStaple,
			lastCookedAt: schema.recipes.lastCookedAt
		})
		.from(schema.recipes)
		.orderBy(schema.recipes.title)
		.all();
}

export function listRecipeSuggestionCandidates(db: DbOrTx, limit = 60) {
	return db
		.select({
			id: schema.recipes.id,
			slug: schema.recipes.slug,
			title: schema.recipes.title,
			category: schema.recipes.category,
			rating: schema.recipes.rating,
			ingredients: schema.recipes.ingredients,
			lastCookedAt: schema.recipes.lastCookedAt,
			cookedCount: schema.recipes.cookedCount
		})
		.from(schema.recipes)
		.orderBy(desc(schema.recipes.rating))
		.limit(limit)
		.all();
}
