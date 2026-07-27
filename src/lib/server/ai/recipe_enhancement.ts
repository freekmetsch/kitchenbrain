import { randomBytes, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Ingredient } from '$lib/recipe_ingredient';
import { createIngredientId, StoredIngredientSchema } from '$lib/recipe_ingredient';
import * as schema from '$lib/server/db/schema';
import type { Db as DB } from '$lib/server/db/types';
import { checkDailyCap, createMessage, loadPrompt, logSpend, parseModelJson } from '$lib/server/ai/client';
import { getBackgroundModel } from '$lib/server/ai/config';
import { updateCanonicalRecipe } from '$lib/server/domains/recipes';
import { reconcileShoppingAfterWrite } from '$lib/server/shopping_entries';
import { addInventory } from '$lib/server/domains/inventory/commands';

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

type StoredProposal = Omit<RecipeEnhancementProposal, 'token'> & { userId: number; recipeId: number; expiresAt: number };
const TTL_MS = 10 * 60 * 1000;
const MAX_PROPOSALS = 100;
const proposals = new Map<string, StoredProposal>();

function storeProposal(value: Omit<StoredProposal, 'expiresAt'>, now = Date.now()): RecipeEnhancementProposal {
	for (const [token, proposal] of proposals) if (proposal.expiresAt <= now) proposals.delete(token);
	while (proposals.size >= MAX_PROPOSALS) proposals.delete(proposals.keys().next().value!);
	const token = randomBytes(24).toString('base64url');
	proposals.set(token, { ...value, expiresAt: now + TTL_MS });
	return { token, recipeSlug: value.recipeSlug, recipeRevision: value.recipeRevision, additions: value.additions, substitutes: value.substitutes };
}

export function stageRecipeEnhancement(
	db: DB,
	input: { recipeSlug: string; userId: number; expectedRecipeId?: number; expectedRecipeRevision?: number },
	modelOutput: unknown,
	now = Date.now()
): RecipeEnhancementProposal {
	const recipe = db.select().from(schema.recipes).where(eq(schema.recipes.slug, input.recipeSlug)).get();
	if (!recipe) throw new Error('Recipe not found');
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

export async function generateRecipeEnhancement(db: DB, input: { recipeSlug: string; userId: number }): Promise<RecipeEnhancementProposal> {
	const recipe = db.select().from(schema.recipes).where(eq(schema.recipes.slug, input.recipeSlug)).get();
	if (!recipe) throw new Error('Recipe not found');
	if (checkDailyCap('background').exceeded) throw new Error('Daily background AI cap reached');
	const model = getBackgroundModel().value;
	const result = await createMessage({
		model,
		system: loadPrompt('recipe_enhance'),
		messages: [{ role: 'user', content: JSON.stringify({ title: recipe.title, servings: recipe.servings, ingredients: recipe.ingredients, directions: recipe.directions, notes: recipe.notes }) }]
	});
	logSpend(result.model, result.usage, result.costUsd);
	return stageRecipeEnhancement(db, {
		...input,
		expectedRecipeId: recipe.id,
		expectedRecipeRevision: recipe.contentRevision
	}, parseModelJson(result.text));
}

export function applyRecipeEnhancement(
	db: DB,
	input: {
		token: string;
		userId: number;
		additions: Array<{ id: string; need: EnhancementNeed }>;
		substituteIds: string[];
		actor: string;
	}
) {
	const proposal = proposals.get(input.token);
	if (!proposal) throw new Error('Recipe proposal expired or was already used');
	proposals.delete(input.token);
	if (proposal.userId !== input.userId || proposal.expiresAt <= Date.now()) throw new Error('Recipe proposal expired or belongs to another user');
	const additionChoices = new Map(input.additions.map((choice) => [choice.id, choice.need]));
	const substituteIds = new Set(input.substituteIds);
	if ([...additionChoices.keys()].some((id) => !proposal.additions.some((addition) => addition.id === id))) throw new Error('Unknown recipe addition');
	if ([...substituteIds].some((id) => !proposal.substitutes.some((substitute) => substitute.id === id))) throw new Error('Unknown recipe substitute');

	return db.transaction((tx) => {
		const executor = tx as unknown as DB;
		const recipe = executor.select().from(schema.recipes).where(eq(schema.recipes.id, proposal.recipeId)).get();
		if (!recipe || recipe.contentRevision !== proposal.recipeRevision) throw new Error('Recipe changed; generate a new proposal');
		const ingredients: Ingredient[] = (recipe.ingredients as Ingredient[]).map((ingredient) => ({
			...ingredient,
			...(ingredient.substitutes ? { substitutes: [...ingredient.substitutes] } : {})
		}));
		for (const addition of proposal.additions) {
			const need = additionChoices.get(addition.id);
			if (!need) continue;
			const ingredient = StoredIngredientSchema.parse({
				id: createIngredientId(), name: addition.name, amount: addition.amount, unit: addition.unit,
				preparation: addition.preparation, component: addition.component,
				optional: need === 'optional', origin: 'ai_accepted'
			});
			ingredients.push(ingredient);
			if (need === 'stocked') addInventory(executor, { name: ingredient.name, section: 'pantry', kind: 'ingredient', isStaple: true }, { actor: input.actor, userId: input.userId });
		}
		for (const substitute of proposal.substitutes) {
			if (!substituteIds.has(substitute.id)) continue;
			const index = ingredients.findIndex((ingredient) => ingredient.id === substitute.ingredientId);
			if (index < 0) throw new Error('Proposal ingredient no longer exists');
			ingredients[index] = { ...ingredients[index], substitutes: [...(ingredients[index].substitutes ?? []), { name: substitute.name, note: substitute.note }] };
		}
		if (additionChoices.size === 0 && substituteIds.size === 0) return { appliedAdditions: 0, appliedSubstitutes: 0, recipeRevision: recipe.contentRevision };
		const updated = updateCanonicalRecipe(executor, {
			recipeId: recipe.id, expectedRevision: proposal.recipeRevision,
			changes: { ingredients, ingredientsEn: null, translationStatus: 'pending', translatedAt: null, cookModeJson: null, cookModeGeneratedAt: null }
		});
		if (!updated) throw new Error('Recipe changed; generate a new proposal');
		reconcileShoppingAfterWrite(executor);
		return { appliedAdditions: additionChoices.size, appliedSubstitutes: substituteIds.size, recipeRevision: updated.contentRevision };
	});
}

export function clearRecipeEnhancementsForTest(): void {
	proposals.clear();
}
