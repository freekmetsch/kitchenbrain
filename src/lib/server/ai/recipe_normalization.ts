import { and, asc, eq, isNull, lt } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';
import type { Ingredient } from '$lib/recipe_ingredient';
import { checkDailyCap } from '$lib/server/ai/client';
import { enrichRecipeStructure, type ScrapedRecipe } from '$lib/server/ai/recipe_ingest';

type DB = BetterSQLite3Database<typeof schema>;

export type NormalizationBatchResult = {
	processed: number;
	improved: number;
	needsReview: number;
	stale: number;
	remaining: number;
	capReached: boolean;
};

function rawLine(ingredient: Ingredient): string {
	return [ingredient.amount, ingredient.unit, ingredient.name, ingredient.preparation]
		.filter(Boolean)
		.join(' ');
}

function asScrapedRecipe(recipe: typeof schema.recipes.$inferSelect): ScrapedRecipe {
	const ingredients = recipe.ingredients as Ingredient[];
	return {
		title: recipe.title,
		category: recipe.category,
		servings: recipe.servings,
		totalTimeMin: recipe.totalTimeMin,
		sourceUrl: recipe.sourceUrl ?? '',
		imageUrl: recipe.imageUrl,
		ingredients,
		directions: recipe.directions,
		notes: recipe.notes,
		language: recipe.language ?? 'nl',
		cuisine: recipe.cuisine,
		rawIngredients: ingredients.map(rawLine),
		structureVersion: 1,
		structureDraft: null,
		enrichmentReviewReason: null
	};
}

export async function normalizeLegacyRecipes(
	db: DB,
	options: {
		limit?: number;
		enrich?: typeof enrichRecipeStructure;
		capExceeded?: () => boolean;
	} = {}
): Promise<NormalizationBatchResult> {
	const limit = Math.max(1, Math.min(10, options.limit ?? 3));
	const enrich = options.enrich ?? enrichRecipeStructure;
	const capExceeded = options.capExceeded ?? (() => checkDailyCap('background').exceeded);
	let processed = 0;
	let improved = 0;
	let needsReview = 0;
	let stale = 0;
	let capReached = false;

	const candidates = db
		.select()
		.from(schema.recipes)
		.where(and(lt(schema.recipes.structureVersion, 2), isNull(schema.recipes.structureDraft)))
		.orderBy(asc(schema.recipes.id))
		.limit(limit)
		.all();

	for (const candidate of candidates) {
		if (capExceeded()) {
			capReached = true;
			break;
		}
		const proposed = await enrich(asScrapedRecipe(candidate));
		processed += 1;
		const sourceUpdatedAt = candidate.updatedAt;
		const changed = db.transaction((tx) => {
			const whereCurrent = and(eq(schema.recipes.id, candidate.id), eq(schema.recipes.updatedAt, sourceUpdatedAt));
			if (proposed.structureVersion === 2) {
				return tx.update(schema.recipes).set({
					ingredients: proposed.ingredients,
					structureVersion: 2,
					structureDraft: null,
					structureDraftSourceUpdatedAt: null,
					needsReview: false,
					reviewReason: null,
					cookModeJson: null,
					cookModeGeneratedAt: null,
					ingredientsEn: null,
					translationStatus: candidate.language === 'en' ? 'ready' : 'pending',
					translatedAt: null,
					updatedAt: new Date()
				}).where(whereCurrent).run().changes;
			}
			return tx.update(schema.recipes).set({
				structureDraft: proposed.structureDraft,
				structureDraftSourceUpdatedAt: sourceUpdatedAt,
				needsReview: true,
				reviewReason: proposed.enrichmentReviewReason ?? 'Check the proposed ingredient structure.'
			}).where(whereCurrent).run().changes;
		});
		if (changed === 0) {
			stale += 1;
			continue;
		}
		if (proposed.structureVersion === 2) improved += 1;
		else needsReview += 1;
	}

	const remaining = db
		.select({ id: schema.recipes.id })
		.from(schema.recipes)
		.where(and(lt(schema.recipes.structureVersion, 2), isNull(schema.recipes.structureDraft)))
		.all().length;
	return { processed, improved, needsReview, stale, remaining, capReached };
}
