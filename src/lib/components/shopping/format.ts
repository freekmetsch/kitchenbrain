// Display formatting helpers shared by the shopping list rows and the AH
// preview cards.

export function itemLabel(item: { amount: string | null; unit: string | null }): string {
	if (item.amount && item.unit) return `${item.amount} ${item.unit}`;
	if (item.amount) return item.amount;
	return '';
}

export function sourceContextLabels(source: {
	mealNames: string[];
	recipeTitle: string | null;
	component: string | null;
}): string[] {
	return [
		...new Set(
			[...source.mealNames, source.recipeTitle, source.component].filter(
				(value): value is string => Boolean(value)
			)
		)
	];
}

export function formatPrice(n: number | null): string {
	return n == null ? '' : `€${n.toFixed(2)}`;
}
