import type {
	ShoppingListItem,
	ShoppingListSource
} from '$lib/components/shopping/types';

export type ShoppingListFilter =
	| { kind: 'all' }
	| { kind: 'meal'; mealName: string }
	| { kind: 'weekly' };

export type ShoppingBoardSection<T extends ShoppingListItem = ShoppingListItem> = {
	kind: 'weekly' | 'shared' | 'meal' | 'other';
	key: string;
	mealName: string | null;
	items: T[];
};

function signature(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLocaleLowerCase('nl-NL')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.sort()
		.join(' ');
}

export function getShoppingFilterOptions(sources: ShoppingListSource[]): {
	meals: string[];
	hasWeekly: boolean;
} {
	const meals: string[] = [];
	const seen = new Set<string>();
	let hasWeekly = false;
	for (const source of sources) {
		if (source.sourceKind === 'weekly') hasWeekly = true;
		for (const mealName of source.mealNames) {
			if (seen.has(mealName)) continue;
			seen.add(mealName);
			meals.push(mealName);
		}
	}
	return { meals, hasWeekly };
}

export function matchesShoppingFilter(
	item: ShoppingListItem,
	filter: ShoppingListFilter
): boolean {
	if (filter.kind === 'all') return true;
	if (filter.kind === 'weekly') {
		return (item.sources ?? []).some((source) => source.sourceKind === 'weekly');
	}
	return (item.sources ?? []).some((source) => source.mealNames.includes(filter.mealName));
}

export function filterShoppingItems<T extends ShoppingListItem>(
	items: T[],
	filter: ShoppingListFilter
): T[] {
	return items.filter((item) => matchesShoppingFilter(item, filter));
}

function itemMealNames(item: ShoppingListItem): string[] {
	return [
		...new Set(
			(item.sources ?? [])
				.filter((source) => source.sourceKind === 'recipe')
				.flatMap((source) => source.mealNames)
		)
	];
}

function hasWeeklySource(item: ShoppingListItem): boolean {
	return (item.sources ?? []).some((source) => source.sourceKind === 'weekly');
}

export function groupShoppingBoardItems<T extends ShoppingListItem>(
	items: T[],
	filter: ShoppingListFilter,
	mealOrder: string[]
): ShoppingBoardSection<T>[] {
	if (filter.kind === 'weekly') {
		return [{ kind: 'weekly', key: 'weekly', mealName: null, items: [...items] }];
	}
	if (filter.kind === 'meal') {
		return [{
			kind: 'meal',
			key: `meal:${filter.mealName}`,
			mealName: filter.mealName,
			items: [...items]
		}];
	}

	const weekly: T[] = [];
	const shared: T[] = [];
	const other: T[] = [];
	const byMeal = new Map(mealOrder.map((mealName) => [mealName, [] as T[]]));

	for (const item of items) {
		if (hasWeeklySource(item)) {
			weekly.push(item);
			continue;
		}
		const mealNames = itemMealNames(item);
		if (mealNames.length > 1) {
			shared.push(item);
			continue;
		}
		if (mealNames.length === 1) {
			const mealItems = byMeal.get(mealNames[0]);
			if (mealItems) mealItems.push(item);
			else byMeal.set(mealNames[0], [item]);
			continue;
		}
		other.push(item);
	}

	return [
		...(weekly.length
			? [{ kind: 'weekly' as const, key: 'weekly', mealName: null, items: weekly }]
			: []),
		...(shared.length
			? [{ kind: 'shared' as const, key: 'shared', mealName: null, items: shared }]
			: []),
		...[...byMeal.entries()]
			.filter(([, mealItems]) => mealItems.length)
			.map(([mealName, mealItems]) => ({
				kind: 'meal' as const,
				key: `meal:${mealName}`,
				mealName,
				items: mealItems
			})),
		...(other.length
			? [{ kind: 'other' as const, key: 'other', mealName: null, items: other }]
			: [])
	];
}

export function projectShoppingStates<T extends ShoppingListItem>(
	pending: T[],
	done: T[],
	filter: ShoppingListFilter
): { active: T[]; covered: T[]; done: T[] } {
	const project = (items: T[]) => filterShoppingItems(items, filter);
	return {
		active: project(pending.filter((item) => !item.covered)),
		covered: project(pending.filter((item) => item.covered)),
		done: project(done)
	};
}

export function shoppingItemKey(item: ShoppingListItem): string {
	const entryIds = [...(item.entryIds ?? [])].sort((left, right) => left - right);
	return entryIds.length ? `entries:${entryIds.join(',')}` : `term:${signature(item.selectedName)}`;
}

export function nextVisibleShoppingKey(
	items: ShoppingListItem[],
	currentKey: string
): string | null {
	if (!items.length) return null;
	const index = items.findIndex((item) => shoppingItemKey(item) === currentKey);
	if (index < 0) return shoppingItemKey(items[0]);
	const next = items[index + 1] ?? items[index - 1];
	return next ? shoppingItemKey(next) : null;
}
