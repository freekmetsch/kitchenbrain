import { db as appDb } from '$lib/server/db/index';
import {
	generateRecipeEnhancementModel,
	stageRecipeEnhancement,
	takeRecipeEnhancementProposal,
	type EnhancementNeed
} from '$lib/server/ai/recipe_enhancement';
import type { Db } from '$lib/server/db/types';
import { addInventory } from '$lib/server/domains/inventory/commands';
import { getRecipeById, getRecipeBySlug, updateCanonicalRecipe } from '$lib/server/domains/recipes';
import {
	createIngredientId,
	StoredIngredientSchema,
	type Ingredient
} from '$lib/recipe_ingredient';
import { reconcileShoppingAfterWrite } from './reconcile-shopping';

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
			return stageRecipeEnhancement(
				current,
				{
					userId: input.userId,
					expectedRecipeId: snapshot.id,
					expectedRecipeRevision: snapshot.contentRevision
				},
				modelOutput
			);
		}
	};
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

export function applyRecipeEnhancement(
	db: Db,
	input: {
		token: string;
		userId: number;
		additions: Array<{ id: string; need: EnhancementNeed }>;
		substituteIds: string[];
		actor: string;
	}
) {
	const proposal = takeRecipeEnhancementProposal(input);
	const additionChoices = new Map(input.additions.map((choice) => [choice.id, choice.need]));
	const substituteIds = new Set(input.substituteIds);
	if (
		[...additionChoices.keys()].some(
			(id) => !proposal.additions.some((addition) => addition.id === id)
		)
	) {
		throw new Error('Unknown recipe addition');
	}
	if (
		[...substituteIds].some(
			(id) => !proposal.substitutes.some((substitute) => substitute.id === id)
		)
	) {
		throw new Error('Unknown recipe substitute');
	}

	return db.transaction((tx) => {
		const recipe = getRecipeById(tx, proposal.recipeId);
		if (!recipe || recipe.contentRevision !== proposal.recipeRevision) {
			throw new Error('Recipe changed; generate a new proposal');
		}
		const ingredients: Ingredient[] = (recipe.ingredients as Ingredient[]).map((ingredient) => ({
			...ingredient,
			...(ingredient.substitutes ? { substitutes: [...ingredient.substitutes] } : {})
		}));
		for (const addition of proposal.additions) {
			const need = additionChoices.get(addition.id);
			if (!need) continue;
			const ingredient = StoredIngredientSchema.parse({
				id: createIngredientId(),
				name: addition.name,
				amount: addition.amount,
				unit: addition.unit,
				preparation: addition.preparation,
				component: addition.component,
				optional: need === 'optional',
				origin: 'ai_accepted'
			});
			ingredients.push(ingredient);
			if (need === 'stocked') {
				addInventory(
					tx,
					{
						name: ingredient.name,
						section: 'pantry',
						kind: 'ingredient',
						isStaple: true
					},
					{ actor: input.actor, userId: input.userId }
				);
			}
		}
		for (const substitute of proposal.substitutes) {
			if (!substituteIds.has(substitute.id)) continue;
			const index = ingredients.findIndex(
				(ingredient) => ingredient.id === substitute.ingredientId
			);
			if (index < 0) throw new Error('Proposal ingredient no longer exists');
			ingredients[index] = {
				...ingredients[index],
				substitutes: [
					...(ingredients[index].substitutes ?? []),
					{ name: substitute.name, note: substitute.note }
				]
			};
		}
		if (additionChoices.size === 0 && substituteIds.size === 0) {
			return {
				appliedAdditions: 0,
				appliedSubstitutes: 0,
				recipeRevision: recipe.contentRevision
			};
		}
		const updated = updateCanonicalRecipe(tx, {
			recipeId: recipe.id,
			expectedRevision: proposal.recipeRevision,
			changes: {
				ingredients,
				ingredientsEn: null,
				translationStatus: 'pending',
				translatedAt: null,
				cookModeJson: null,
				cookModeGeneratedAt: null
			}
		});
		if (!updated) throw new Error('Recipe changed; generate a new proposal');
		reconcileShoppingAfterWrite(tx);
		return {
			appliedAdditions: additionChoices.size,
			appliedSubstitutes: substituteIds.size,
			recipeRevision: updated.contentRevision
		};
	});
}
