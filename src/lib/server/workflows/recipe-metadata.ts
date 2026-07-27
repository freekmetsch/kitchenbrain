import { db as appDb } from '$lib/server/db/index';
import type { Db } from '$lib/server/db/types';
import { setFreezerStaple } from '$lib/server/domains/inventory/freezer';
import {
	getRecipeBySlug,
	updateRecipeMetadata
} from '$lib/server/domains/recipes';

type RecipeMetadataPatch = {
	isFreezerStaple?: boolean;
	targetPortions?: number | null;
	dismissReview?: boolean;
};

export function createRecipeMetadataService(db: Db) {
	return {
		patch(slug: string, input: RecipeMetadataPatch) {
			return db.transaction((tx) => {
				const recipe = getRecipeBySlug(tx, slug);
				if (!recipe) return null;
				if (input.isFreezerStaple !== undefined) {
					setFreezerStaple(tx, recipe.id, input.isFreezerStaple, input.targetPortions);
				}
				const changes: {
					targetPortions?: number | null;
					needsReview?: boolean;
					reviewReason?: string | null;
				} = {};
				if (input.isFreezerStaple === undefined && input.targetPortions !== undefined) {
					changes.targetPortions = input.targetPortions;
				}
				if (input.dismissReview) {
					changes.needsReview = false;
					changes.reviewReason = null;
				}
				if (Object.keys(changes).length > 0) updateRecipeMetadata(tx, recipe.id, changes);
				const updated = getRecipeBySlug(tx, slug)!;
				return {
					slug: updated.slug,
					isFreezerStaple: updated.isFreezerStaple,
					targetPortions: updated.targetPortions,
					needsReview: updated.needsReview
				};
			});
		}
	};
}

const recipeMetadataService = createRecipeMetadataService(appDb);

export function patchRecipeMetadata(slug: string, input: RecipeMetadataPatch) {
	return recipeMetadataService.patch(slug, input);
}
