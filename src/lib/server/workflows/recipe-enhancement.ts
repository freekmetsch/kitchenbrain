import { db as appDb } from '$lib/server/db/index';
import {
	applyRecipeEnhancement,
	generateRecipeEnhancement,
	type EnhancementNeed
} from '$lib/server/ai/recipe_enhancement';

export function generateRecipeEnhancementForApp(input: {
	recipeSlug: string;
	userId: number;
}) {
	return generateRecipeEnhancement(appDb, input);
}

export function applyRecipeEnhancementForApp(input: {
	token: string;
	userId: number;
	additions: Array<{ id: string; need: EnhancementNeed }>;
	substituteIds: string[];
	actor: string;
}) {
	return applyRecipeEnhancement(appDb, input);
}
