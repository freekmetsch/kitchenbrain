// Meal Recipe composition (ADR 0003): a meal recipe is a normal recipes row
// whose parts are live links to standalone sub-recipes, one level deep.
// This module is the write boundary for the composition invariants:
//   - a meal recipe can never be a sub-recipe (no nesting);
//   - a recipe that already has sub-recipes can't be added as a sub;
//   - a recipe can't be its own sub.
//
// AH-INVARIANT: expandMealIngredients emits Dutch `recipes.ingredients[].name`
// entries only — sub-recipe expansion happens BEFORE the existing shopping
// derivation, never instead of it.
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';
import type { Ingredient } from '$lib/server/db/schema';
import { slugify, uniqueSlug } from '$lib/server/ai/recipe_ingest';
import { projectIngredient } from '$lib/recipe_scale';
import { captureRecipeSource } from '$lib/recipe_source_snapshot';

type DB = BetterSQLite3Database<typeof schema>;

export type SubRecipeRef = {
	id: number;
	slug: string;
	title: string;
	titleEn: string | null;
	sortOrder: number;
};

export type MealRef = { id: number; slug: string; title: string; titleEn: string | null };

export type ExpandedMealIngredient = {
	ownerRecipeId: number;
	ownerRecipeSlug: string;
	ownerRecipeTitle: string;
	ingredientId: string;
	component: string | null;
	flatIndex: number;
	ingredient: Ingredient;
};

export class MealCompositionError extends Error {
	constructor(
		public code:
			| 'too_few_subs'
			| 'sub_not_found'
			| 'sub_is_meal'
			| 'meal_is_sub'
			| 'self_reference',
		message: string
	) {
		super(message);
	}
}

/** Sub-recipes of a meal recipe, in sort order. Empty = not a meal recipe. */
export function subRecipesOf(db: DB, mealRecipeId: number): SubRecipeRef[] {
	return db
		.select({
			id: schema.recipes.id,
			slug: schema.recipes.slug,
			title: schema.recipes.title,
			titleEn: schema.recipes.titleEn,
			sortOrder: schema.mealSubRecipes.sortOrder
		})
		.from(schema.mealSubRecipes)
		.innerJoin(schema.recipes, eq(schema.mealSubRecipes.subRecipeId, schema.recipes.id))
		.where(eq(schema.mealSubRecipes.mealRecipeId, mealRecipeId))
		.orderBy(asc(schema.mealSubRecipes.sortOrder), asc(schema.mealSubRecipes.id))
		.all();
}

/** Meals that contain the given recipe as a sub — the "Part of" display. */
export function mealsContaining(db: DB, subRecipeId: number): MealRef[] {
	return db
		.select({
			id: schema.recipes.id,
			slug: schema.recipes.slug,
			title: schema.recipes.title,
			titleEn: schema.recipes.titleEn
		})
		.from(schema.mealSubRecipes)
		.innerJoin(schema.recipes, eq(schema.mealSubRecipes.mealRecipeId, schema.recipes.id))
		.where(eq(schema.mealSubRecipes.subRecipeId, subRecipeId))
		.all();
}

/** Sub-recipe count per meal recipe id — recipes-list badges in one query. */
export function subRecipeCountByMeal(db: DB): Map<number, number> {
	const rows = db
		.select({ mealRecipeId: schema.mealSubRecipes.mealRecipeId })
		.from(schema.mealSubRecipes)
		.all();
	const counts = new Map<number, number>();
	for (const r of rows) counts.set(r.mealRecipeId, (counts.get(r.mealRecipeId) ?? 0) + 1);
	return counts;
}

/**
 * A meal's full shopping-relevant ingredient list: its own extras plus every
 * sub-recipe's ingredients, Dutch names throughout. For a non-meal recipe this
 * returns its own ingredients unchanged.
 */
export function expandMealIngredients(
	db: DB,
	recipe: { id: number; slug?: string; title?: string; ingredients: unknown },
	subRecipes?: SubRecipeRef[]
): Ingredient[] {
	return expandMealIngredientSources(db, recipe, subRecipes).map((row) => row.ingredient);
}

function sourceRows(
	db: DB,
	recipe: { id: number; slug?: string; title?: string; servings?: number | null; ingredients: unknown },
	subRecipes?: SubRecipeRef[]
) {
	const own = {
		id: recipe.id,
		slug: recipe.slug ?? `recipe-${recipe.id}`,
		title: recipe.title ?? recipe.slug ?? `Recipe ${recipe.id}`,
		servings: recipe.servings ?? null,
		ingredients: (recipe.ingredients as Ingredient[]) ?? []
	};
	const subs = subRecipes ?? subRecipesOf(db, recipe.id);
	if (subs.length === 0) return [own];
	const rows = db
		.select({
			id: schema.recipes.id,
			slug: schema.recipes.slug,
			title: schema.recipes.title,
			servings: schema.recipes.servings,
			ingredients: schema.recipes.ingredients
		})
		.from(schema.recipes)
		.where(inArray(schema.recipes.id, subs.map((sub) => sub.id)))
		.all();
	const byId = new Map(rows.map((row) => [row.id, row]));
	return [own, ...subs.flatMap((sub) => (byId.has(sub.id) ? [byId.get(sub.id)!] : []))];
}

/**
 * Keep the leaf recipe owner and component beside every ingredient. The flat
 * order stays identical to the compatibility Ingredient[] projection.
 */
export function expandMealIngredientSources(
	db: DB,
	recipe: { id: number; slug?: string; title?: string; ingredients: unknown },
	subRecipes?: SubRecipeRef[]
): ExpandedMealIngredient[] {
	let flatIndex = 0;
	return sourceRows(db, recipe, subRecipes).flatMap((owner) =>
		((owner.ingredients as Ingredient[]) ?? []).map((ingredient, ingredientIndex) => ({
			ownerRecipeId: owner.id,
			ownerRecipeSlug: owner.slug,
			ownerRecipeTitle: owner.title,
			ingredientId: ingredient.id ?? `legacy_${owner.id}_${ingredientIndex}`,
			component: ingredient.component ?? null,
			flatIndex: flatIndex++,
			ingredient
		}))
	);
}

/**
 * Project every component from its own yield to one meal occasion. This is the
 * composite-recipe quantity invariant: child yields may differ, but the meal's
 * requested portions are shared.
 */
export function expandMealIngredientsForServings(
	db: DB,
	recipe: { id: number; slug?: string; title?: string; servings: number | null; ingredients: unknown },
	occasionServings: number | null | undefined,
	subRecipes?: SubRecipeRef[]
): Ingredient[] {
	return expandMealIngredientSourcesForServings(db, recipe, occasionServings, subRecipes).map(
		(row) => row.ingredient
	);
}

export function expandMealIngredientSourcesForServings(
	db: DB,
	recipe: { id: number; slug?: string; title?: string; servings: number | null; ingredients: unknown },
	occasionServings: number | null | undefined,
	subRecipes?: SubRecipeRef[]
): ExpandedMealIngredient[] {
	const target = occasionServings ?? recipe.servings;
	let flatIndex = 0;
	return sourceRows(db, recipe, subRecipes).flatMap((owner) =>
		((owner.ingredients as Ingredient[]) ?? []).map((ingredient, ingredientIndex) => ({
			ownerRecipeId: owner.id,
			ownerRecipeSlug: owner.slug,
			ownerRecipeTitle: owner.title,
			ingredientId: ingredient.id ?? `legacy_${owner.id}_${ingredientIndex}`,
			component: ingredient.component ?? null,
			flatIndex: flatIndex++,
			ingredient: projectIngredient(ingredient, owner.servings, target)
		}))
	);
}

/**
 * Create a Meal Recipe: a fresh recipes row (own extras start empty; the
 * edit page adds tortillas/assembly later) plus links to ≥ 2 sub-recipes.
 */
export function createMealRecipe(
	db: DB,
	opts: { title: string; subRecipeIds: number[] }
): typeof schema.recipes.$inferSelect {
	const subIds = [...new Set(opts.subRecipeIds)];
	if (subIds.length < 2) {
		throw new MealCompositionError('too_few_subs', 'A meal recipe combines at least 2 recipes.');
	}
	const found = db
		.select({ id: schema.recipes.id, servings: schema.recipes.servings })
		.from(schema.recipes)
		.where(inArray(schema.recipes.id, subIds))
		.all();
	if (found.length !== subIds.length) {
		throw new MealCompositionError('sub_not_found', 'One of the selected recipes does not exist.');
	}
	const now = new Date();
	const knownYields = found.map((recipe) => recipe.servings).filter((value): value is number => value != null && value > 0);
	const servings = knownYields.length ? Math.max(...knownYields) : 4;
	const slug = uniqueSlug(db, slugify(opts.title));
	const meal = db
		.insert(schema.recipes)
		.values({
			slug,
			title: opts.title,
			ingredients: [],
			directions: [],
			directionIdsJson: [],
			sourceSnapshotJson: captureRecipeSource(
				{
					title: opts.title,
					servings,
					sourceUrl: null,
					ingredients: [],
					directions: []
				},
				{ capturedAt: now.getTime() }
			),
			servings,
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();
	for (const subId of subIds) {
		addSubRecipe(db, meal.id, subId);
	}
	return meal;
}

function assertLinkable(db: DB, mealRecipeId: number, subRecipeId: number): void {
	if (mealRecipeId === subRecipeId) {
		throw new MealCompositionError('self_reference', 'A recipe cannot contain itself.');
	}
	const subIsMeal = db
		.select({ id: schema.mealSubRecipes.id })
		.from(schema.mealSubRecipes)
		.where(eq(schema.mealSubRecipes.mealRecipeId, subRecipeId))
		.get();
	if (subIsMeal) {
		throw new MealCompositionError(
			'sub_is_meal',
			'That recipe is itself a meal recipe — composition is one level deep.'
		);
	}
	const mealIsSub = db
		.select({ id: schema.mealSubRecipes.id })
		.from(schema.mealSubRecipes)
		.where(eq(schema.mealSubRecipes.subRecipeId, mealRecipeId))
		.get();
	if (mealIsSub) {
		throw new MealCompositionError(
			'meal_is_sub',
			'That recipe is a sub-recipe of another meal — it cannot have sub-recipes of its own.'
		);
	}
}

/** Link one sub-recipe to a meal (idempotent on the unique pair). */
export function addSubRecipe(db: DB, mealRecipeId: number, subRecipeId: number): boolean {
	assertLinkable(db, mealRecipeId, subRecipeId);
	const existing = db
		.select({ id: schema.mealSubRecipes.id })
		.from(schema.mealSubRecipes)
		.where(eq(schema.mealSubRecipes.mealRecipeId, mealRecipeId))
		.all();
	const result = db.insert(schema.mealSubRecipes)
		.values({
			mealRecipeId,
			subRecipeId,
			sortOrder: existing.length,
			createdAt: new Date()
		})
		.onConflictDoNothing()
		.run();
	return result.changes > 0;
}

export function removeSubRecipe(db: DB, mealRecipeId: number, subRecipeId: number): boolean {
	const result = db.delete(schema.mealSubRecipes)
		.where(
			and(
				eq(schema.mealSubRecipes.mealRecipeId, mealRecipeId),
				eq(schema.mealSubRecipes.subRecipeId, subRecipeId)
			)
		)
		.run();
	if (result.changes === 0) return false;
	// Re-pack sortOrder densely so future appends stay stable.
	const remaining = db
		.select({ id: schema.mealSubRecipes.id })
		.from(schema.mealSubRecipes)
		.where(eq(schema.mealSubRecipes.mealRecipeId, mealRecipeId))
		.orderBy(asc(schema.mealSubRecipes.sortOrder), asc(schema.mealSubRecipes.id))
		.all();
	remaining.forEach((row, i) => {
		db.update(schema.mealSubRecipes)
			.set({ sortOrder: i })
			.where(eq(schema.mealSubRecipes.id, row.id))
			.run();
	});
	return true;
}
