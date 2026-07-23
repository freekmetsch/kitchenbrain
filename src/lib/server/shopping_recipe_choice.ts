import { and, eq, gte, isNull, ne, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Ingredient } from '$lib/recipe_ingredient';
import * as schema from '$lib/server/db/schema';
import { updateCanonicalRecipe } from '$lib/server/recipe_mutations';
import { reconcileShoppingAfterWrite, shoppingPlanningConfig } from '$lib/server/shopping_entries';
import { addInventory, updateInventory } from '$lib/server/inventory_writes';
import { findExistingItem } from '$lib/server/inventory_merge';
import { ShoppingMutationError } from '$lib/server/shopping_mutations';

type DB = BetterSQLite3Database<typeof schema>;
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
	db: DB,
	input: {
		recipeSlug: string;
		ingredientId: string;
		substituteIndex: number;
		expectedRecipeRevision: number;
	}
) {
	return db.transaction((tx) => {
		const executor = tx as unknown as DB;
		const recipe = executor
			.select()
			.from(schema.recipes)
			.where(eq(schema.recipes.slug, input.recipeSlug))
			.get();
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
		const updated = updateCanonicalRecipe(executor, {
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
		reconcileShoppingAfterWrite(executor);
		return updated;
	});
}

export function applyShoppingRecipeChoice(
	db: DB,
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
		const executor = tx as unknown as DB;
		const entry = executor
			.select()
			.from(schema.shoppingWeekEntries)
			.where(eq(schema.shoppingWeekEntries.id, input.entryId))
			.get();
		if (!entry || entry.sourceKind !== 'recipe' || entry.retiredAt || !entry.recipeId || !entry.ingredientId) {
			throw new ShoppingMutationError('invalid_source', 'Active recipe ingredient source not found');
		}
		const currentWeek = shoppingPlanningConfig(executor).currentWeek;
		if (entry.weekStartDate < currentWeek) {
			throw new ShoppingMutationError('past_week', 'Captured past shopping weeks cannot be changed');
		}
		if (entry.revision !== input.expectedEntryRevision) {
			throw new ShoppingMutationError('stale', 'Shopping source changed');
		}
		if (!entry.approvedTerms.includes(input.term)) {
			throw new ShoppingMutationError('invalid_term', 'Choose the Dutch recipe name or a saved Dutch alternative');
		}
		const recipe = executor.select().from(schema.recipes).where(eq(schema.recipes.id, entry.recipeId)).get();
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
			const updated = updateCanonicalRecipe(executor, {
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

		const inventoryMatch = findExistingItem(executor, { name: shoppingName, section: 'pantry', kind: 'ingredient' });
		if (input.need === 'stocked') {
			addInventory(executor, { name: shoppingName, section: 'pantry', kind: 'ingredient', isStaple: true }, { actor: input.actor, userId: input.userId });
		} else if (inventoryMatch?.item.isStaple) {
			updateInventory(executor, inventoryMatch.item.id, { isStaple: false }, { actor: input.actor, userId: input.userId });
		}

		reconcileShoppingAfterWrite(executor, [entry.weekStartDate]);
		const refreshed = executor
			.select()
			.from(schema.shoppingWeekEntries)
			.where(
				and(
					eq(schema.shoppingWeekEntries.weekStartDate, entry.weekStartDate),
					eq(schema.shoppingWeekEntries.sourceKey, entry.sourceKey),
					isNull(schema.shoppingWeekEntries.retiredAt)
				)
			)
			.get();
		if (!refreshed) throw new ShoppingMutationError('invalid_source', 'Shopping source disappeared during the recipe update');
		executor
			.update(schema.shoppingWeekEntries)
			.set({
				name: shoppingName,
				approvedTerms: [shoppingName, ...(next.substitutes ?? []).map((substitute) => substitute.name)],
				included: input.need === 'required',
				selectedName,
				revision: sql`${schema.shoppingWeekEntries.revision} + 1`,
				updatedAt: new Date()
			})
			.where(eq(schema.shoppingWeekEntries.id, refreshed.id))
			.run();
		executor
			.update(schema.shoppingWeekEntries)
			.set({
				included: input.need === 'required',
				revision: sql`${schema.shoppingWeekEntries.revision} + 1`,
				updatedAt: new Date()
			})
			.where(
				and(
					eq(schema.shoppingWeekEntries.sourceKey, entry.sourceKey),
					gte(schema.shoppingWeekEntries.weekStartDate, currentWeek),
					isNull(schema.shoppingWeekEntries.retiredAt),
					ne(schema.shoppingWeekEntries.id, refreshed.id),
					ne(schema.shoppingWeekEntries.included, input.need === 'required')
				)
			)
			.run();

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
