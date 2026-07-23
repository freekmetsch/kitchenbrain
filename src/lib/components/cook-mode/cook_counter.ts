import type { CookModeStep } from '$lib/types';

export type SessionIngredientSwap = {
	substituteIndex: number;
	canonicalName: string;
	displayName: string;
};

export function toggleCounterIngredient(
	checks: Record<string, boolean>,
	ingredientId: string
): Record<string, boolean> {
	return { ...checks, [ingredientId]: !checks[ingredientId] };
}

export function applySessionSwapsToSteps(
	steps: CookModeStep[],
	swaps: Record<string, SessionIngredientSwap>,
	originalNames: Record<string, string>
): CookModeStep[] {
	const replaceLinkedNames = (value: string, ingredientIds: string[] | undefined): string => {
		let next = value;
		for (const ingredientId of new Set(ingredientIds ?? [])) {
			const swap = swaps[ingredientId];
			const original = originalNames[ingredientId];
			if (!swap || !original) continue;
			const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			next = next.replace(new RegExp(escaped, 'giu'), swap.displayName);
		}
		return next;
	};

	return steps.map((step) => ({
		...step,
		title: replaceLinkedNames(step.title, step.ingredient_ids),
		goal: replaceLinkedNames(step.goal, step.ingredient_ids),
		body: replaceLinkedNames(step.body, step.ingredient_ids),
		ingredients: step.ingredients.map((label, index) => {
			const ingredientId = step.ingredient_ids?.[index];
			const swap = ingredientId ? swaps[ingredientId] : undefined;
			const original = ingredientId ? originalNames[ingredientId] : undefined;
			if (!swap || !original) return label;
			const at = label.toLocaleLowerCase().lastIndexOf(original.toLocaleLowerCase());
			if (at < 0) return label;
			return `${label.slice(0, at)}${swap.displayName}${label.slice(at + original.length)}`;
		}),
		ingredient_names: step.ingredient_names?.map((name, index) => {
			const ingredientId = step.ingredient_ids?.[index];
			return (ingredientId && swaps[ingredientId]?.displayName) || name;
		})
	}));
}
