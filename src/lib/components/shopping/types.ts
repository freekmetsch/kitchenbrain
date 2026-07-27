import type { IngredientPurchaseForm } from '$lib/recipe_ingredient';

export type ShoppingListSource = {
	id: number;
	revision: number;
	sourceKind: 'recipe' | 'weekly' | 'manual' | 'legacy';
	recipeId: number | null;
	recipeSlug: string | null;
	recipeTitle: string | null;
	recipeRevision: number | null;
	ingredientId: string | null;
	name: string;
	term: string;
	amount: string | null;
	unit: string | null;
	component: string | null;
	mealNames: string[];
	approvedTerms: string[];
	included: boolean;
	bought: boolean;
	optional: boolean;
	staple: boolean;
	purchaseForm?: IngredientPurchaseForm;
	needsReview: boolean;
};

export type ShoppingListItem = {
	name: string;
	amount: string | null;
	unit: string | null;
	bought: boolean;
	manual: boolean;
	manualContribution?: boolean;
	manualAmount?: string | null;
	manualUnit?: string | null;
	derivedAmount?: string | null;
	derivedUnit?: string | null;
	included: boolean;
	selectedName: string;
	covered?: boolean;
	staple?: boolean;
	optional?: boolean;
	suggested?: boolean;
	substitutes?: string[];
	purchaseForm?: IngredientPurchaseForm;
	incompatibleQuantities?: boolean;
	forMeals?: string[];
	freshSide?: boolean;
	entryIds?: number[];
	sources?: ShoppingListSource[];
};

/** Per-item push decision inside the AH preview sheet. */
export type Decision = {
	mode: 'product' | 'freetext' | 'exclude';
	pick: number;
	qty: number;
	quantityConfirmed: boolean;
};

/** Outcome summary of one AH push, shown in the sheet's result view. */
export type AhPushOutcome = {
	pushed: number;
	accountName: string | null;
	destination: 'order' | 'list';
	failed: { term: string; kind: 'product' | 'freetext' }[];
	markedBought: number;
	uncertain: boolean;
	reason?: string;
};
