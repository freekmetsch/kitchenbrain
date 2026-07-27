import { db as appDb } from '$lib/server/db/index';
import type { Ingredient } from '$lib/recipe_ingredient';
import type { Db } from '$lib/server/db/types';
import {
	getRecipeById,
	getRecipeBySlug,
	updateCanonicalRecipe
} from '$lib/server/domains/recipes';
import { reconcileShoppingAfterWrite } from './reconcile-shopping';
import { shoppingPlanningConfig } from '$lib/server/domains/shopping/entries';
import { addInventory, updateInventory } from '$lib/server/domains/inventory/commands';
import { findExistingItem } from '$lib/server/domains/inventory/merge';
import {
	applyRecipeShoppingChoice,
	ShoppingMutationError
} from '$lib/server/domains/shopping/commands';
import {
	getActiveShoppingEntryBySource,
	getShoppingWeekEntry
} from '$lib/server/domains/shopping/queries';

export type ShoppingNeed = 'required' | 'optional' | 'stocked';

function promotedIngredient(current: Ingredient, term: string): Ingredient {
	const substitute = current.substitutes?.find((candidate) => candidate.name === term);
	if (!substitute) {
		throw new ShoppingMutationError(
			'invalid_term',
			'The selected term is not a saved recipe alternative'
		);
	}
	const remaining = (current.substitutes ?? []).filter((candidate) => candidate.name !== term);
	return {
		...current,
		name: term,
		substitutes: [
			...remaining,
			{ name: current.name, kind: substitute.kind, note: substitute.note }
		]
	};
}

export function saveRecipeIngredientDefault(
	db: Db,
	input: {
		recipeSlug: string;
		ingredientId: string;
		substituteIndex: number;
		expectedRecipeRevision: number;
	}
) {
	return db.transaction((tx) => {
		const recipe = getRecipeBySlug(tx, input.recipeSlug);
		if (!recipe || recipe.contentRevision !== input.expectedRecipeRevision) {
			throw new ShoppingMutationError(
				'stale',
				'Recipe changed; reload before applying this choice'
			);
		}
		const ingredients = recipe.ingredients.map((ingredient) => ({ ...ingredient }));
		const ingredientIndex = ingredients.findIndex(
			(ingredient) => ingredient.id === input.ingredientId
		);
		if (ingredientIndex < 0) {
			throw new ShoppingMutationError(
				'invalid_source',
				'Ingredient no longer belongs to this recipe'
			);
		}
		const current = ingredients[ingredientIndex];
		const canonicalTerm = current.substitutes?.[input.substituteIndex]?.name;
		if (!canonicalTerm) {
			throw new ShoppingMutationError(
				'invalid_term',
				'Choose a saved Dutch recipe alternative'
			);
		}
		ingredients[ingredientIndex] = promotedIngredient(current, canonicalTerm);
		const updated = updateCanonicalRecipe(tx, {
			recipeId: recipe.id,
			expectedRevision: input.expectedRecipeRevision,
			changes: {
				ingredients,
				ingredientsEn: null,
				translationStatus: 'pending',
				translatedAt: null
			}
		});
		if (!updated) {
			throw new ShoppingMutationError(
				'stale',
				'Recipe changed; reload before applying this choice'
			);
		}
		reconcileShoppingAfterWrite(tx);
		return updated;
	});
}

export function applyShoppingRecipeChoice(
	db: Db,
	input: {
		entryId: number;
		expectedEntryRevision: number;
		expectedRecipeRevision: number;
		need: ShoppingNeed;
		term: string;
		useInRecipe: boolean;
		actor: string;
		userId: number;
	}
) {
	return db.transaction((tx) => {
		const entry = getShoppingWeekEntry(tx, input.entryId);
		if (!entry || entry.sourceKind !== 'recipe' || entry.retiredAt || !entry.recipeId || !entry.ingredientId) {
			throw new ShoppingMutationError('invalid_source', 'Active recipe ingredient source not found');
		}
		const currentWeek = shoppingPlanningConfig(tx).currentWeek;
		if (entry.weekStartDate < currentWeek) {
			throw new ShoppingMutationError('past_week', 'Captured past shopping weeks cannot be changed');
		}
		if (entry.revision !== input.expectedEntryRevision) {
			throw new ShoppingMutationError('stale', 'Shopping source changed');
		}
		if (!entry.approvedTerms.includes(input.term)) {
			throw new ShoppingMutationError('invalid_term', 'Choose the Dutch recipe name or a saved Dutch alternative');
		}
		const recipe = getRecipeById(tx, entry.recipeId);
		if (!recipe || recipe.contentRevision !== input.expectedRecipeRevision) {
			throw new ShoppingMutationError('stale', 'Recipe changed; reload before applying this choice');
		}
		const ingredients = (recipe.ingredients as Ingredient[]).map((ingredient) => ({ ...ingredient }));
		const index = ingredients.findIndex((ingredient) => ingredient.id === entry.ingredientId);
		if (index < 0) throw new ShoppingMutationError('invalid_source', 'Ingredient no longer belongs to this recipe');
		const current = ingredients[index];
		let selectedName: string | null = input.term === current.name ? null : input.term;
		let shoppingName = current.name;
		let recipeChanged = current.optional !== (input.need === 'optional');
		let next: Ingredient = { ...current, optional: input.need === 'optional' };

		if (input.useInRecipe && input.term !== current.name) {
			next = { ...promotedIngredient(current, input.term), optional: next.optional };
			shoppingName = input.term;
			selectedName = null;
			recipeChanged = true;
		}
		ingredients[index] = next;

		if (recipeChanged) {
			const updated = updateCanonicalRecipe(tx, {
				recipeId: recipe.id,
				expectedRevision: input.expectedRecipeRevision,
				changes: {
					ingredients,
					ingredientsEn: null,
					translationStatus: 'pending',
					translatedAt: null,
					cookModeJson: null,
					cookModeGeneratedAt: null
				}
			});
			if (!updated) throw new ShoppingMutationError('stale', 'Recipe changed; reload before applying this choice');
		}

		const inventoryMatch = findExistingItem(tx, { name: shoppingName, section: 'pantry', kind: 'ingredient' });
		if (input.need === 'stocked') {
			addInventory(tx, { name: shoppingName, section: 'pantry', kind: 'ingredient', isStaple: true }, { actor: input.actor, userId: input.userId });
		} else if (inventoryMatch?.item.isStaple) {
			updateInventory(tx, inventoryMatch.item.id, { isStaple: false }, { actor: input.actor, userId: input.userId });
		}

		reconcileShoppingAfterWrite(tx, [entry.weekStartDate]);
		const refreshed = getActiveShoppingEntryBySource(
			tx,
			entry.weekStartDate,
			entry.sourceKey
		);
		if (!refreshed) throw new ShoppingMutationError('invalid_source', 'Shopping source disappeared during the recipe update');
		applyRecipeShoppingChoice(tx, {
			entryId: refreshed.id,
			sourceKey: entry.sourceKey,
			currentWeek,
			name: shoppingName,
			approvedTerms: [
				shoppingName,
				...(next.substitutes ?? []).map((substitute) => substitute.name)
			],
			included: input.need === 'required',
			selectedName
		});

		return {
			recipeId: recipe.id,
			recipeRevision: recipe.contentRevision + (recipeChanged ? 1 : 0),
			entryId: refreshed.id,
			name: shoppingName,
			need: input.need,
			selectedName
		};
	});
}

export function chooseShoppingSource(
	input: Parameters<typeof applyShoppingRecipeChoice>[1]
) {
	return applyShoppingRecipeChoice(appDb, input);
}

export function saveRecipeIngredientChoice(input: Parameters<typeof saveRecipeIngredientDefault>[1]) {
	return saveRecipeIngredientDefault(appDb, input);
}
