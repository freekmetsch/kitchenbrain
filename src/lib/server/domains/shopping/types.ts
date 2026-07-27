import type { Ingredient, MealSource } from '$lib/server/db/schema';

export type PlannedMealForNeeds = {
	id?: number;
	dinner: string;
	recipeSlug: string | null;
	source: MealSource;
	servings?: number | null;
};

export type ShoppingSourceRef = {
	key: `recipe:${number}:${string}`;
	recipeId: number;
	recipeSlug: string;
	ingredientId: string;
	mealIds: number[];
};

export type ShoppingSourceContribution = {
	ref: ShoppingSourceRef;
	name: string;
	amount: string;
	unit?: string;
	component: string | null;
	forMeals: string[];
	freshSideOnly: boolean;
	optional: boolean;
	suggested: boolean;
	substitutes: string[];
	purchaseForm: Ingredient['purchaseForm'];
	incompatibleQuantities: boolean;
};

export type NeededIngredient = {
	name: string;
	amount: string;
	unit?: string;
	forMeals: string[];
	freshSideOnly: boolean;
	optional: boolean;
	suggested: boolean;
	substitutes: string[];
	purchaseForm: Ingredient['purchaseForm'];
	incompatibleQuantities: boolean;
	sources: ShoppingSourceContribution[];
};

export type FreezerMealRef = { dinner: string; recipeSlug: string };

export type WeekNeeds = {
	needed: NeededIngredient[];
	mealsWithoutRecipe: string[];
	freezerMeals: FreezerMealRef[];
	freezerMealsMissingFreshInfo: FreezerMealRef[];
};
