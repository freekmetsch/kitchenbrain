export type RemovedListItem<T> = {
	item: T;
	index: number;
};

export function captureRemoval<T extends { id: number }>(
	items: T[],
	itemId: number
): { items: T[]; removed: RemovedListItem<T> | null } {
	const index = items.findIndex((item) => item.id === itemId);
	if (index < 0) return { items, removed: null };
	return {
		items: items.filter((item) => item.id !== itemId),
		removed: { item: { ...items[index] }, index }
	};
}

export function restoreRemoval<T extends { id: number }>(
	items: T[],
	removed: RemovedListItem<T>
): T[] {
	const withoutDuplicate = items.filter((item) => item.id !== removed.item.id);
	const index = Math.min(Math.max(removed.index, 0), withoutDuplicate.length);
	return [
		...withoutDuplicate.slice(0, index),
		{ ...removed.item },
		...withoutDuplicate.slice(index)
	];
}
