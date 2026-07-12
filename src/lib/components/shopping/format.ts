// Display formatting helpers shared by the shopping list rows and the AH
// preview cards.

export function itemLabel(item: { amount: string | null; unit: string | null }): string {
	if (item.amount && item.unit) return `${item.amount} ${item.unit}`;
	if (item.amount) return item.amount;
	return '';
}

export function formatPrice(n: number | null): string {
	return n == null ? '' : `€${n.toFixed(2)}`;
}
