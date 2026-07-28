import { db as appDb } from '$lib/server/db/index';
import {
	enhancementModelToPatchOperations,
	generateRecipeEnhancementModel,
} from '$lib/server/ai/recipe_enhancement';
import {
	applyRecipePatch,
	stageRecipePatch
} from '$lib/server/ai/recipe_patch';
import type { Db } from '$lib/server/db/types';
import { getRecipeBySlug } from '$lib/server/domains/recipes';

export function generateRecipeEnhancementForApp(input: {
	recipeSlug: string;
	userId: number;
}) {
	return generateRecipeEnhancement(appDb, input);
}

export function generateRecipeEnhancement(
	db: Db,
	input: {
		recipeSlug: string;
		userId: number;
	}
) {
	return createRecipeEnhancementService(db).generate(input);
}

export function createRecipeEnhancementService(
	db: Db,
	generateModel: typeof generateRecipeEnhancementModel = generateRecipeEnhancementModel
) {
	return {
		async generate(input: { recipeSlug: string; userId: number }) {
			const snapshot = getRecipeBySlug(db, input.recipeSlug);
			if (!snapshot) throw new Error('Recipe not found');
			const modelOutput = await generateModel(snapshot);
			const current = getRecipeBySlug(db, input.recipeSlug);
			if (!current) throw new Error('Recipe not found');
			if (
				current.id !== snapshot.id ||
				current.contentRevision !== snapshot.contentRevision
			) {
				throw new Error('Recipe changed; generate a new proposal');
			}
			return stageRecipePatch(
				current,
				{
					userId: input.userId,
					operations: enhancementModelToPatchOperations(modelOutput)
				}
			);
		}
	};
}

export function applyRecipeEnhancementForApp(input: {
	token: string;
	userId: number;
	operationIds: string[];
}) {
	return applyRecipeEnhancement(appDb, input);
}

export function applyRecipeEnhancement(
	db: Db,
	input: {
		token: string;
		userId: number;
		operationIds: string[];
	}
) {
	return applyRecipePatch(db, input);
}
