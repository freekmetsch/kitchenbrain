import { and, eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';
import { reconcileDirectionIds } from '$lib/recipe_source_snapshot';

type DB = BetterSQLite3Database<typeof schema>;
type RecipeInsert = typeof schema.recipes.$inferInsert;

export type CanonicalRecipeUpdate = Partial<
	Pick<
		RecipeInsert,
		| 'title'
		| 'category'
		| 'servings'
		| 'scalingMode'
		| 'structureVersion'
		| 'structureDraft'
		| 'structureDraftSourceUpdatedAt'
		| 'totalTimeMin'
		| 'sourceUrl'
		| 'ingredients'
		| 'directions'
		| 'directionIdsJson'
		| 'notes'
		| 'rating'
		| 'cuisine'
		| 'language'
		| 'needsReview'
		| 'reviewReason'
		| 'cookModeJson'
		| 'cookModeGeneratedAt'
		| 'titleEn'
		| 'categoryEn'
		| 'cuisineEn'
		| 'notesEn'
		| 'ingredientsEn'
		| 'directionsEn'
		| 'translationStatus'
		| 'translatedAt'
	>
>;

/**
 * The sole update seam for canonical recipe content. The compare-and-swap on
 * contentRevision prevents stale writers, while SQL arithmetic guarantees a
 * distinct revision even when several writes share one clock tick.
 */
export function updateCanonicalRecipe(
	db: DB,
	options: {
		recipeId: number;
		expectedRevision: number;
		changes: CanonicalRecipeUpdate;
		now?: Date;
	}
): typeof schema.recipes.$inferSelect | undefined {
	const changes = { ...options.changes };
	if (changes.directions && !changes.directionIdsJson) {
		const current = db
			.select({
				directions: schema.recipes.directions,
				directionIdsJson: schema.recipes.directionIdsJson
			})
			.from(schema.recipes)
			.where(
				and(
					eq(schema.recipes.id, options.recipeId),
					eq(schema.recipes.contentRevision, options.expectedRevision)
				)
			)
			.get();
		if (!current) return undefined;
		changes.directionIdsJson = reconcileDirectionIds(
			current.directions,
			current.directionIdsJson,
			changes.directions
		);
	}
	return db
		.update(schema.recipes)
		.set({
			...changes,
			contentRevision: sql`${schema.recipes.contentRevision} + 1`,
			updatedAt: options.now ?? new Date()
		})
		.where(
			and(
				eq(schema.recipes.id, options.recipeId),
				eq(schema.recipes.contentRevision, options.expectedRevision)
			)
		)
		.returning()
		.get();
}

/** Cache-only compare-and-swap. Planning metadata never changes canonical revision. */
export function updateCookModeCache(
	db: DB,
	options: {
		recipeId: number;
		expectedRevision: number;
		cookModeJson: RecipeInsert['cookModeJson'];
		cookModeGeneratedAt: Date;
	}
): typeof schema.recipes.$inferSelect | undefined {
	return db
		.update(schema.recipes)
		.set({
			cookModeJson: options.cookModeJson,
			cookModeGeneratedAt: options.cookModeGeneratedAt
		})
		.where(
			and(
				eq(schema.recipes.id, options.recipeId),
				eq(schema.recipes.contentRevision, options.expectedRevision)
			)
		)
		.returning()
		.get();
}
