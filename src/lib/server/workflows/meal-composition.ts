import { db as appDb } from '$lib/server/db/index';
import type { Db } from '$lib/server/db/types';
import {
	addSubRecipe,
	createMealRecipe,
	getRecipeBySlug,
	getRecipesBySlugs,
	listMealCandidates,
	removeSubRecipe,
	subRecipesOf,
	updateCanonicalRecipe
} from '$lib/server/domains/recipes';
import { reconcileShoppingAfterWrite } from '$lib/server/workflows/reconcile-shopping';

type MealCompositionDependencies = {
	reconcileShopping: typeof reconcileShoppingAfterWrite;
};

const DEFAULT_DEPENDENCIES: MealCompositionDependencies = {
	reconcileShopping: reconcileShoppingAfterWrite
};

export function createMealCompositionService(
	db: Db,
	dependencies: MealCompositionDependencies = DEFAULT_DEPENDENCIES
) {
	return {
		getCandidates() {
			return listMealCandidates(db);
		},

		create(input: { title: string; subRecipeSlugs: string[] }) {
			const subs = getRecipesBySlugs(db, input.subRecipeSlugs);
			if (subs.length !== new Set(input.subRecipeSlugs).size) return { found: false as const };
			const meal = db.transaction((tx) =>
				createMealRecipe(tx, {
					title: input.title,
					subRecipeIds: subs.map((recipe) => recipe.id)
				})
			);
			return { found: true as const, meal };
		},

		change(input: {
			mealSlug: string;
			targetSlug: string;
			action: 'add' | 'remove';
		}) {
			const result = db.transaction((tx) => {
				const meal = getRecipeBySlug(tx, input.mealSlug);
				if (!meal) return { status: 'meal_not_found' as const };
				const target = getRecipeBySlug(tx, input.targetSlug);
				if (!target) return { status: 'sub_not_found' as const };
				const changed =
					input.action === 'add'
						? addSubRecipe(tx, meal.id, target.id)
						: removeSubRecipe(tx, meal.id, target.id);
				if (changed) {
					const updated = updateCanonicalRecipe(tx, {
						recipeId: meal.id,
						expectedRevision: meal.contentRevision,
						changes: { cookModeJson: null, cookModeGeneratedAt: null }
					});
					if (!updated) return { status: 'stale' as const };
					dependencies.reconcileShopping(tx);
				}
				return { status: 'ok' as const, changed, mealId: meal.id };
			});
			return result;
		},

		getComponents(mealId: number) {
			return subRecipesOf(db, mealId);
		}
	};
}

const mealCompositionService = createMealCompositionService(appDb);

export function getMealCandidates() {
	return mealCompositionService.getCandidates();
}

export function createMeal(input: { title: string; subRecipeSlugs: string[] }) {
	return mealCompositionService.create(input);
}

export function changeMealComposition(input: {
	mealSlug: string;
	targetSlug: string;
	action: 'add' | 'remove';
}) {
	return mealCompositionService.change(input);
}

export function getMealComponents(mealId: number) {
	return mealCompositionService.getComponents(mealId);
}
