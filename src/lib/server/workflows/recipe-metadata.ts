import { db as appDb } from '$lib/server/db/index';
import { setFreezerStaple } from '$lib/server/domains/inventory/freezer';
import {
	getRecipeBySlug,
	updateRecipeMetadata
} from '$lib/server/domains/recipes';

export function patchRecipeMetadata(
	slug: string,
	input: {
		isFreezerStaple?: boolean;
		targetPortions?: number | null;
		dismissReview?: boolean;
	}
) {
	return appDb.transaction((tx) => {
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
