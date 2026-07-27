import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Ingredient } from '$lib/recipe_ingredient';
import { checkDailyCap, createMessage, loadPrompt, logSpend, parseModelJson } from '$lib/server/ai/client';
import { getBackgroundModel } from '$lib/server/ai/config';

export type EnhancementNeed = 'required' | 'optional' | 'stocked';

const AdditionSchema = z.object({
	name: z.string().trim().min(1).max(256),
	amount: z.string().trim().max(64),
	unit: z.string().trim().min(1).max(64).optional(),
	preparation: z.string().trim().min(1).max(256).optional(),
	component: z.string().trim().min(1).max(256).optional(),
	reason: z.string().trim().min(1).max(500)
});
const SubstituteSchema = z.object({
	ingredientId: z.string().trim().min(1),
	name: z.string().trim().min(1).max(256),
	note: z.string().trim().min(1).max(500).optional(),
	reason: z.string().trim().min(1).max(500)
});
const ModelProposalSchema = z.object({
	additions: z.array(AdditionSchema).max(20),
	substitutes: z.array(SubstituteSchema).max(30)
});

export type EnhancementAddition = z.infer<typeof AdditionSchema> & { id: string };
export type EnhancementSubstitute = z.infer<typeof SubstituteSchema> & { id: string; ingredientName: string };
export type RecipeEnhancementProposal = {
	token: string;
	recipeSlug: string;
	recipeRevision: number;
	additions: EnhancementAddition[];
	substitutes: EnhancementSubstitute[];
};

export type StoredRecipeEnhancementProposal = Omit<RecipeEnhancementProposal, 'token'> & {
	userId: number;
	recipeId: number;
	expiresAt: number;
};
export type RecipeEnhancementSource = {
	id: number;
	slug: string;
	contentRevision: number;
	title: string;
	servings: number | null;
	ingredients: unknown;
	directions: unknown;
	notes: string | null;
};
const TTL_MS = 10 * 60 * 1000;
const MAX_PROPOSALS = 100;
const proposals = new Map<string, StoredRecipeEnhancementProposal>();

function storeProposal(
	value: Omit<StoredRecipeEnhancementProposal, 'expiresAt'>,
	now = Date.now()
): RecipeEnhancementProposal {
	for (const [token, proposal] of proposals) if (proposal.expiresAt <= now) proposals.delete(token);
	while (proposals.size >= MAX_PROPOSALS) proposals.delete(proposals.keys().next().value!);
	const token = randomBytes(24).toString('base64url');
	proposals.set(token, { ...value, expiresAt: now + TTL_MS });
	return { token, recipeSlug: value.recipeSlug, recipeRevision: value.recipeRevision, additions: value.additions, substitutes: value.substitutes };
}

export function stageRecipeEnhancement(
	recipe: RecipeEnhancementSource,
	input: { userId: number; expectedRecipeId?: number; expectedRecipeRevision?: number },
	modelOutput: unknown,
	now = Date.now()
): RecipeEnhancementProposal {
	if (
		(input.expectedRecipeId !== undefined && recipe.id !== input.expectedRecipeId) ||
		(input.expectedRecipeRevision !== undefined && recipe.contentRevision !== input.expectedRecipeRevision)
	) throw new Error('Recipe changed; generate a new proposal');
	const parsed = ModelProposalSchema.parse(modelOutput);
	const ingredientIds = new Set((recipe.ingredients as Ingredient[]).flatMap((ingredient) => ingredient.id ? [ingredient.id] : []));
	for (const substitute of parsed.substitutes) {
		if (!ingredientIds.has(substitute.ingredientId)) throw new Error('Proposal refers to an ingredient that is not in this recipe');
	}
	const existingNames = new Set((recipe.ingredients as Ingredient[]).map((ingredient) => ingredient.name.toLowerCase()));
	const additions = parsed.additions
		.filter((addition) => !existingNames.has(addition.name.toLowerCase()))
		.map((addition) => ({ ...addition, id: randomUUID() }));
	const seenSubstitutes = new Set<string>();
	const substitutes = parsed.substitutes.filter((substitute) => {
		const key = `${substitute.ingredientId}\u0000${substitute.name.toLowerCase()}`;
		if (seenSubstitutes.has(key)) return false;
		seenSubstitutes.add(key);
		const ingredient = (recipe.ingredients as Ingredient[]).find((candidate) => candidate.id === substitute.ingredientId);
		return ingredient && ingredient.name.toLowerCase() !== substitute.name.toLowerCase() && !(ingredient.substitutes ?? []).some((candidate) => candidate.name.toLowerCase() === substitute.name.toLowerCase());
	}).map((substitute) => ({
		...substitute,
		id: randomUUID(),
		ingredientName: (recipe.ingredients as Ingredient[]).find((ingredient) => ingredient.id === substitute.ingredientId)!.name
	}));
	return storeProposal({ userId: input.userId, recipeId: recipe.id, recipeSlug: recipe.slug, recipeRevision: recipe.contentRevision, additions, substitutes }, now);
}

export async function generateRecipeEnhancementModel(
	recipe: RecipeEnhancementSource
): Promise<unknown> {
	if (checkDailyCap('background').exceeded) throw new Error('Daily background AI cap reached');
	const model = getBackgroundModel().value;
	const result = await createMessage({
		model,
		system: loadPrompt('recipe_enhance'),
		messages: [{ role: 'user', content: JSON.stringify({ title: recipe.title, servings: recipe.servings, ingredients: recipe.ingredients, directions: recipe.directions, notes: recipe.notes }) }]
	});
	logSpend(result.model, result.usage, result.costUsd);
	return parseModelJson(result.text);
}

export function takeRecipeEnhancementProposal(
	input: { token: string; userId: number },
	now = Date.now()
): StoredRecipeEnhancementProposal {
	const proposal = proposals.get(input.token);
	if (!proposal) throw new Error('Recipe proposal expired or was already used');
	proposals.delete(input.token);
	if (proposal.userId !== input.userId || proposal.expiresAt <= now) {
		throw new Error('Recipe proposal expired or belongs to another user');
	}
	return proposal;
}

export function clearRecipeEnhancementsForTest(): void {
	proposals.clear();
}
