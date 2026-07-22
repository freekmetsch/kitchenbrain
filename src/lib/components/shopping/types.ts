import type { IngredientPurchaseForm } from '$lib/recipe_ingredient';

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
};

/** Per-item push decision inside the AH preview sheet. */
export type Decision = { mode: 'product' | 'freetext' | 'exclude'; pick: number; qty: number };

/** Outcome summary of one AH push, shown in the sheet's result view. */
export type AhPushOutcome = {
	pushed: number;
	accountName: string | null;
	destination: 'order' | 'list';
	failed: { term: string; kind: 'product' | 'freetext' }[];
	markedBought: number;
	reason?: string;
};
