import { and, eq, sql } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type { DbOrTx } from '$lib/server/db/types';
import { reconcileDirectionIds } from '$lib/recipe_source_snapshot';

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

export function updateCanonicalRecipe(
	db: DbOrTx,
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

export function updateCookModeCache(
	db: DbOrTx,
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

export function stageRecipeStructureDraft(
	db: DbOrTx,
	options: {
		recipeId: number;
		expectedRevision: number;
		structureDraft: RecipeInsert['structureDraft'];
		structureDraftSourceUpdatedAt: Date;
		reviewReason: string;
	}
): boolean {
	return (
		db
			.update(schema.recipes)
			.set({
				structureDraft: options.structureDraft,
				structureDraftSourceUpdatedAt: options.structureDraftSourceUpdatedAt,
				needsReview: true,
				reviewReason: options.reviewReason
			})
			.where(
				and(
					eq(schema.recipes.id, options.recipeId),
					eq(schema.recipes.contentRevision, options.expectedRevision)
				)
			)
			.run().changes > 0
	);
}

export function updateRecipeMetadata(
	db: DbOrTx,
	recipeId: number,
	changes: {
		targetPortions?: number | null;
		needsReview?: boolean;
		reviewReason?: string | null;
	},
	now = new Date()
) {
	return db
		.update(schema.recipes)
		.set({ ...changes, updatedAt: now })
		.where(eq(schema.recipes.id, recipeId))
		.returning()
		.get();
}

export function updateRecipeTranslationCache(
	db: DbOrTx,
	options: {
		recipeId: number;
		expectedRevision: number;
		changes: Pick<
			RecipeInsert,
			| 'titleEn'
			| 'categoryEn'
			| 'cuisineEn'
			| 'notesEn'
			| 'ingredientsEn'
			| 'directionsEn'
			| 'translationStatus'
			| 'translatedAt'
		>;
		now?: Date;
	}
) {
	return db
		.update(schema.recipes)
		.set({ ...options.changes, updatedAt: options.now ?? new Date() })
		.where(
			and(
				eq(schema.recipes.id, options.recipeId),
				eq(schema.recipes.contentRevision, options.expectedRevision)
			)
		)
		.returning()
		.get();
}

export function updateRecipeCookStats(
	db: DbOrTx,
	recipeId: number,
	stats: { lastCookedAt: Date | null; cookedCount: number },
	now = new Date()
): void {
	db.update(schema.recipes)
		.set({ ...stats, updatedAt: now })
		.where(eq(schema.recipes.id, recipeId))
		.run();
}
