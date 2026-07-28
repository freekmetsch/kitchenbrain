import { z } from 'zod';
import { checkDailyCap, createMessage, loadPrompt, logSpend, parseModelJson } from '$lib/server/ai/client';
import { getBackgroundModel } from '$lib/server/ai/config';
import type { RecipePatchOperationInput } from '$lib/server/ai/recipe_patch';

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

export function enhancementModelToPatchOperations(
	modelOutput: unknown
): RecipePatchOperationInput[] {
	const parsed = ModelProposalSchema.parse(modelOutput);
	return [
		...parsed.additions.map(
			(addition): RecipePatchOperationInput => ({
				kind: 'add_ingredient',
				after: {
					name: addition.name,
					amount: addition.amount,
					unit: addition.unit,
					preparation: addition.preparation,
					component: addition.component,
					optional: true
				},
				reason: addition.reason
			})
		),
		...parsed.substitutes.map(
			(substitute): RecipePatchOperationInput => ({
				kind: 'add_substitute',
				ingredient_id: substitute.ingredientId,
				after: {
					name: substitute.name,
					note: substitute.note
				},
				reason: substitute.reason
			})
		)
	];
}

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
