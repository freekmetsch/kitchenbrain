import * as schema from '$lib/server/db/schema';
import type { Ingredient } from '$lib/server/db/schema';
import type { DbOrTx } from '$lib/server/db/types';
import { captureRecipeSource, ensureDirectionIds } from '$lib/recipe_source_snapshot';
import { slugifyRecipeTitle, uniqueRecipeSlug } from './composition';
import { normalizeFoodCategory } from '$lib/food_categories';

export type ImportedRecipeInput = {
	title: string;
	category: string | null;
	servings: number | null;
	totalTimeMin: number | null;
	sourceUrl: string;
	imageUrl: string | null;
	ingredients: Ingredient[];
	directions: string[];
	notes: string | null;
	language: string;
	cuisine: string | null;
	structureVersion: 1 | 2;
	structureDraft: Ingredient[] | null;
	enrichmentReviewReason: string | null;
};

export function reviewFields(reason: string | null): {
	needsReview: boolean;
	reviewReason: string | null;
} {
	return { needsReview: reason !== null, reviewReason: reason };
}

function importReviewReason(data: ImportedRecipeInput): string | null {
	if (data.enrichmentReviewReason) return data.enrichmentReviewReason;
	const gaps: string[] = [];
	if (data.ingredients.length === 0) gaps.push('no ingredients found');
	if (data.directions.length === 0) gaps.push('no directions found');
	if (data.language && data.language !== 'nl') {
		gaps.push('non-Dutch source — ingredient names may need Dutch for Albert Heijn');
	}
	if (gaps.length === 0) return null;
	const detail = data.servings == null ? [...gaps, 'servings unknown'] : gaps;
	return `Imported from URL — please check: ${detail.join(', ')}.`;
}

export function createImportedRecipe(db: DbOrTx, data: ImportedRecipeInput) {
	const review = reviewFields(importReviewReason(data));
	const baseSlug = slugifyRecipeTitle(data.title) || 'recipe';
	const slug = uniqueRecipeSlug(db, baseSlug);
	const now = new Date();
	const sourceSnapshotJson = captureRecipeSource(
		{
			title: data.title,
			servings: data.servings,
			sourceUrl: data.sourceUrl,
			ingredients: data.ingredients,
			directions: data.directions
		},
		{ capturedAt: now.getTime() }
	);
	const recipe = db
		.insert(schema.recipes)
		.values({
			slug,
			title: data.title,
			category: data.category,
			servings: data.servings,
			structureVersion: data.structureVersion,
			structureDraft: data.structureDraft,
			structureDraftSourceUpdatedAt: data.structureDraft ? now : null,
			totalTimeMin: data.totalTimeMin,
			sourceUrl: data.sourceUrl,
			imageUrl: data.imageUrl,
			ingredients: data.ingredients,
			directions: data.directions,
			directionIdsJson: ensureDirectionIds(data.directions),
			sourceSnapshotJson,
			notes: data.notes,
			rating: null,
			cuisine: data.cuisine,
			language: data.language ?? 'nl',
			...review,
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();
	return { recipe, review };
}

export function ingredientStructureVersion(ingredients: Ingredient[]): 1 | 2 {
	return ingredients.length > 0 &&
		ingredients.every(
			(ingredient) =>
				(ingredient.role === 'cook_in' || ingredient.role === 'serve_fresh') &&
				typeof ingredient.optional === 'boolean' &&
				Boolean(ingredient.purchaseForm) &&
				Boolean(ingredient.scale) &&
				Boolean(ingredient.origin)
		)
		? 2
		: 1;
}

export function createCanonicalRecipe(
	db: DbOrTx,
	input: {
		title: string;
		slug: string;
		category?: string;
		servings?: number;
		totalTimeMin?: number;
		ingredients: Ingredient[];
		directions: string[];
		notes?: string;
		sourceUrl?: string;
		reviewReason: string | null;
	}
) {
	const now = new Date();
	const review = reviewFields(input.reviewReason);
	return db
		.insert(schema.recipes)
		.values({
			title: input.title,
			slug: input.slug,
			category: normalizeFoodCategory(input.category),
			servings: input.servings ?? null,
			structureVersion: ingredientStructureVersion(input.ingredients),
			totalTimeMin: input.totalTimeMin ?? null,
			ingredients: input.ingredients,
			directions: input.directions,
			directionIdsJson: ensureDirectionIds(input.directions),
			sourceSnapshotJson: captureRecipeSource(
				{
					title: input.title,
					servings: input.servings ?? null,
					sourceUrl: input.sourceUrl ?? null,
					ingredients: input.ingredients,
					directions: input.directions
				},
				{ capturedAt: now.getTime() }
			),
			notes: input.notes ?? null,
			sourceUrl: input.sourceUrl ?? null,
			...review,
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();
}
