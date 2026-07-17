// Shared types + display helpers for the stock page components. Data types
// derive from the inventory route's server load (via the generated $types) so
// the components stay in lock-step with the actual shape — no hand-kept mirror.
import type { PageData } from '../../../routes/inventory/$types';
import { foodCategoryLabel } from '$lib/food_categories';
import { daysSinceDate } from '$lib/inventory_dates';

export type Item = PageData['items'][number];
export type RecipeLink = PageData['recipeLinks'][number];
export type RecipeMatch = PageData['recipeMatches'][number][number];
export type RecipeSuggestion = PageData['leftoverSuggestions'][number][number];
export type RecipeOption = PageData['recipeOptions'][number];
export type StapleGhost = PageData['stapleGhosts'][number];

export type Kind = 'ingredient' | 'leftover' | 'processed';
export type Section = 'freezer' | 'pantry';

export type HistoryEvent = {
	id: number;
	opType: 'add' | 'remove' | 'update';
	actorLabel: string;
	itemId: number | null;
	itemName: string;
	summary: string;
	createdAt: number;
	isUndo: boolean;
	undoable: boolean;
};

// Edit draft for the in-place row editor. The keep-stocked fields patch the
// linked RECIPE, not the item (UX-STOCK-14).
export type EditDraft = {
	name: string;
	qty: number | null;
	unit: string;
	kind: Kind | '';
	section: Section;
	foodClass: string;
	expiry: string;
	staple: boolean;
	keepStocked: boolean;
	target: number | null;
};

export const FOOD_CLASS_LABEL: Record<string, string> = {
	meat: 'Meat', fish: 'Fish', vegetarian: 'Veggie', other: 'Other'
};

// ── display helpers ──────────────────────────────────────────────────────────
export function daysOld(item: Item): number {
	return daysSinceDate(item.createdAt) ?? 0;
}
export function aging(item: Item): 'fresh' | 'soon' | 'old' {
	const [soon, old] = item.kind === 'leftover' ? [21, 35] : [90, 180];
	const d = daysOld(item);
	if (d >= old) return 'old';
	if (d >= soon) return 'soon';
	return 'fresh';
}
export function agingBar(item: Item): string {
	const a = aging(item);
	return a === 'old' ? 'bg-error' : a === 'soon' ? 'bg-warning' : 'bg-base-content/15';
}
export function foodClassText(slug: string | null): string {
	return foodCategoryLabel(slug) ?? 'Unclassified';
}
export function composeQty(n: number, unit: string | null): string {
	return `${n}${unit ? ' ' + unit : ''}`;
}

export function autofocus(node: HTMLInputElement) {
	node.focus();
	node.select();
}
