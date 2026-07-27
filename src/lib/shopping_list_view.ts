import type { ShoppingListItem } from '$lib/components/shopping/types';

export const STORE_ROUTE_SECTIONS = [
	'Fresh',
	'Bakery',
	'Chilled',
	'Pantry',
	'Frozen',
	'Household',
	'Other'
] as const;

export type StoreRouteSection = (typeof STORE_ROUTE_SECTIONS)[number];
export type ShoppingListSort = 'list' | 'alpha' | 'store';
export type ShoppingListFilter =
	| { kind: 'all' }
	| { kind: 'meal'; mealName: string }
	| { kind: 'weekly' };

const sectionIndex = new Map<StoreRouteSection, number>(
	STORE_ROUTE_SECTIONS.map((section, index) => [section, index])
);
const dutchCollator = new Intl.Collator('nl-NL', { sensitivity: 'base', numeric: true });

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

function signatures(values: string[]): Set<string> {
	return new Set(values.map(signature));
}

const routeTerms: Record<Exclude<StoreRouteSection, 'Other'>, Set<string>> = {
	Fresh: signatures([
		'tomaat',
		'tomaten',
		'rode ui',
		'rode uien',
		'gele ui',
		'gele uien',
		'ui',
		'uien',
		'prei',
		'wortel',
		'wortels',
		'paprika',
		'komkommer',
		'sla',
		'spinazie',
		'appel',
		'appels',
		'banaan',
		'bananen',
		'citroen',
		'citroenen',
		'limoen',
		'knoflook',
		'aardappel',
		'aardappelen',
		'kipfilet',
		'gehakt',
		'zalm'
	]),
	Bakery: signatures([
		'brood',
		'bruin brood',
		'wit brood',
		'volkorenbrood',
		'stokbrood',
		'pistolets',
		'croissants',
		'wraps',
		'naan'
	]),
	Chilled: signatures([
		'melk',
		'yoghurt',
		'kwark',
		'boter',
		'roomboter',
		'kaas',
		'eieren',
		'room',
		'creme fraiche',
		'tofu'
	]),
	Pantry: signatures([
		'rijst',
		'pasta',
		'spaghetti',
		'penne',
		'suiker',
		'bloem',
		'meel',
		'olie',
		'azijn',
		'rijstazijn',
		'bonen',
		'tomatenblokjes',
		'bouillon',
		'zout',
		'peper'
	]),
	Frozen: signatures([
		'diepvrieserwten',
		'diepvries spinazie',
		'ijs',
		'kroketten'
	]),
	Household: signatures([
		'toiletpapier',
		'keukenpapier',
		'afwasmiddel',
		'wasmiddel',
		'vuilniszakken',
		'schoonmaakmiddel'
	])
};

function lexicalSection(
	name: string,
	allowed: readonly Exclude<StoreRouteSection, 'Other'>[] = [
		'Bakery',
		'Chilled',
		'Household',
		'Fresh',
		'Pantry',
		'Frozen'
	]
): StoreRouteSection {
	const key = signature(name);
	return allowed.find((section) => routeTerms[section].has(key)) ?? 'Other';
}

export function resolveStoreRouteSection(item: ShoppingListItem): StoreRouteSection {
	const forms = new Set(
		(item.sources ?? [])
			.filter((source) => source.sourceKind === 'recipe')
			.map((source) => source.purchaseForm)
			.filter((form): form is 'fresh' | 'preserved' | 'frozen' | 'dried' =>
				form != null && form !== 'any'
			)
	);
	if (forms.size > 1) return 'Other';
	const form = forms.values().next().value;
	if (form === 'frozen') return 'Frozen';
	if (form === 'preserved' || form === 'dried') return 'Pantry';
	if (form === 'fresh') {
		const refinement = lexicalSection(item.selectedName, ['Bakery', 'Chilled']);
		return refinement === 'Other' ? 'Fresh' : refinement;
	}
	return lexicalSection(item.selectedName);
}

export function getShoppingFilterOptions(items: ShoppingListItem[]): {
	meals: string[];
	hasWeekly: boolean;
} {
	const meals: string[] = [];
	const seen = new Set<string>();
	let hasWeekly = false;
	for (const item of items) {
		for (const source of item.sources ?? []) {
			if (source.sourceKind === 'weekly') hasWeekly = true;
			for (const mealName of source.mealNames) {
				if (seen.has(mealName)) continue;
				seen.add(mealName);
				meals.push(mealName);
			}
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

export function sortShoppingItems<T extends ShoppingListItem>(
	items: T[],
	sort: ShoppingListSort
): T[] {
	if (sort === 'list') return [...items];
	return items
		.map((item, index) => ({ item, index }))
		.sort((left, right) => {
			if (sort === 'store') {
				const sectionDifference =
					sectionIndex.get(resolveStoreRouteSection(left.item))! -
					sectionIndex.get(resolveStoreRouteSection(right.item))!;
				if (sectionDifference) return sectionDifference;
			} else {
				const nameDifference = dutchCollator.compare(
					left.item.selectedName,
					right.item.selectedName
				);
				if (nameDifference) return nameDifference;
			}
			return left.index - right.index;
		})
		.map(({ item }) => item);
}

export function projectShoppingStates<T extends ShoppingListItem>(
	pending: T[],
	done: T[],
	filter: ShoppingListFilter,
	sort: ShoppingListSort
): { active: T[]; covered: T[]; done: T[] } {
	const project = (items: T[]) => sortShoppingItems(filterShoppingItems(items, filter), sort);
	return {
		active: project(pending.filter((item) => !item.covered)),
		covered: project(pending.filter((item) => item.covered)),
		done: project(done)
	};
}

export function groupShoppingItems<T extends ShoppingListItem>(
	items: T[]
): Array<{ section: StoreRouteSection; items: T[] }> {
	return STORE_ROUTE_SECTIONS.map((section) => ({
		section,
		items: items.filter((item) => resolveStoreRouteSection(item) === section)
	}));
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
