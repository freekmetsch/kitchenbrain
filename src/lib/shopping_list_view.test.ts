import { describe, expect, it } from 'vitest';
import type { ShoppingListItem, ShoppingListSource } from '$lib/components/shopping/types';
import {
	STORE_ROUTE_SECTIONS,
	filterShoppingItems,
	getShoppingFilterOptions,
	groupShoppingItems,
	nextVisibleShoppingKey,
	projectShoppingStates,
	resolveStoreRouteSection,
	shoppingItemKey,
	sortShoppingItems
} from './shopping_list_view';

function source(
	overrides: Partial<ShoppingListSource> & Pick<ShoppingListSource, 'sourceKind'>
): ShoppingListSource {
	return {
		id: 1,
		revision: 1,
		recipeId: null,
		recipeSlug: null,
		recipeTitle: null,
		recipeRevision: null,
		ingredientId: null,
		name: 'item',
		term: 'item',
		amount: null,
		unit: null,
		component: null,
		mealNames: [],
		approvedTerms: ['item'],
		included: true,
		bought: false,
		optional: false,
		staple: false,
		needsReview: false,
		...overrides
	};
}

function item(
	name: string,
	sources: ShoppingListSource[],
	overrides: Partial<ShoppingListItem> = {}
): ShoppingListItem {
	return {
		name,
		selectedName: name,
		amount: null,
		unit: null,
		bought: false,
		manual: false,
		included: true,
		entryIds: sources.map((entry) => entry.id),
		sources,
		...overrides
	};
}

describe('shopping list view projection', () => {
	const shared = item('tomaten', [
		source({ id: 1, sourceKind: 'recipe', mealNames: ['Soep'], purchaseForm: 'fresh' }),
		source({ id: 2, sourceKind: 'recipe', mealNames: ['Pasta'], purchaseForm: 'fresh' })
	]);
	const weekly = item('melk', [source({ id: 3, sourceKind: 'weekly' })]);
	const manual = item('lucifers', [source({ id: 4, sourceKind: 'manual' })]);

	it('derives unique meal filters and Weekly from source ownership', () => {
		expect(getShoppingFilterOptions([shared, weekly, manual, shared])).toEqual({
			meals: ['Soep', 'Pasta'],
			hasWeekly: true
		});
	});

	it('shows one shared row in either exact meal filter and keeps manual rows in All only', () => {
		expect(filterShoppingItems([shared], { kind: 'meal', mealName: 'Soep' })).toEqual([shared]);
		expect(filterShoppingItems([shared, weekly, manual], { kind: 'meal', mealName: 'Pasta' })).toEqual([
			shared
		]);
		expect(filterShoppingItems([shared, weekly, manual], { kind: 'weekly' })).toEqual([weekly]);
		expect(filterShoppingItems([shared, weekly, manual], { kind: 'meal', mealName: 'pasta' })).toEqual([]);
	});

	it('applies one predicate to pending, covered, and completed projections', () => {
		const pendingShared = { ...shared, covered: false };
		const coveredShared = { ...shared, entryIds: [5], covered: true };
		const doneShared = { ...shared, entryIds: [6], bought: true };
		const states = projectShoppingStates(
			[pendingShared, coveredShared, manual],
			[doneShared],
			{ kind: 'meal', mealName: 'Soep' },
			'list'
		);
		expect(states.active).toEqual([pendingShared]);
		expect(states.covered).toEqual([coveredShared]);
		expect(states.done).toEqual([doneShared]);
	});

	it('sorts A–Z with Dutch diacritics, stable ties, and original list order as the fallback', () => {
		const firstA = item('Álgebra', [source({ id: 10, sourceKind: 'manual' })]);
		const secondA = item('algebra', [source({ id: 11, sourceKind: 'manual' })]);
		const eel = item('éclair', [source({ id: 12, sourceKind: 'manual' })]);
		const zebra = item('zebra', [source({ id: 13, sourceKind: 'manual' })]);
		const original = [zebra, secondA, eel, firstA];
		expect(sortShoppingItems(original, 'list')).toEqual(original);
		expect(sortShoppingItems(original, 'alpha')).toEqual([secondA, firstA, eel, zebra]);
	});

	it('uses unanimous purchase forms conservatively and sends mixed forms to Other', () => {
		expect(resolveStoreRouteSection(shared)).toBe('Fresh');
		expect(resolveStoreRouteSection(item('erwten', [
			source({ id: 20, sourceKind: 'recipe', purchaseForm: 'frozen' }),
			source({ id: 21, sourceKind: 'recipe', purchaseForm: 'frozen' })
		]))).toBe('Frozen');
		expect(resolveStoreRouteSection(item('tomaten', [
			source({ id: 22, sourceKind: 'recipe', purchaseForm: 'fresh' }),
			source({ id: 23, sourceKind: 'recipe', purchaseForm: 'preserved' })
		]))).toBe('Other');
		expect(resolveStoreRouteSection(item('brood', [
			source({ id: 24, sourceKind: 'recipe', purchaseForm: 'fresh' })
		]))).toBe('Bakery');
		expect(resolveStoreRouteSection(item('melk', [
			source({ id: 25, sourceKind: 'recipe', purchaseForm: 'fresh' })
		]))).toBe('Chilled');
	});

	it('uses only exact Dutch phrases or whole-token signatures and defaults unknowns to Other', () => {
		expect(resolveStoreRouteSection(item('toiletpapier', [source({ id: 30, sourceKind: 'weekly' })]))).toBe('Household');
		expect(resolveStoreRouteSection(item('crème fraîche', [source({ id: 31, sourceKind: 'manual' })]))).toBe('Chilled');
		expect(resolveStoreRouteSection(item('rode uien', [source({ id: 32, sourceKind: 'manual' })]))).toBe('Fresh');
		expect(resolveStoreRouteSection(item('diepvries spinazie', [source({ id: 33, sourceKind: 'manual' })]))).toBe('Frozen');
		expect(resolveStoreRouteSection(item('rijstazijn', [source({ id: 34, sourceKind: 'manual' })]))).toBe('Pantry');
		expect(resolveStoreRouteSection(item('melkchocolade', [source({ id: 35, sourceKind: 'manual' })]))).toBe('Other');
		expect(resolveStoreRouteSection(item('broodmes', [source({ id: 36, sourceKind: 'manual' })]))).toBe('Other');
		expect(resolveStoreRouteSection(item('mysterieproduct', [source({ id: 37, sourceKind: 'manual' })]))).toBe('Other');
	});

	it('returns fixed Store Route groups, keeps stable order, and never mutates canonical items', () => {
		const other = item('mysterieproduct', [source({ id: 40, sourceKind: 'manual' })]);
		const bread = item('brood', [source({ id: 41, sourceKind: 'manual' })]);
		const milk = item('melk', [source({ id: 42, sourceKind: 'manual' })]);
		const input = [other, milk, bread];
		const before = structuredClone(input);
		const groups = groupShoppingItems(sortShoppingItems(input, 'store'));
		expect(groups.map((group) => group.section)).toEqual(STORE_ROUTE_SECTIONS);
		expect(groups.flatMap((group) => group.items).map((entry) => entry.name)).toEqual([
			'brood',
			'melk',
			'mysterieproduct'
		]);
		expect(input).toEqual(before);
		expect(groupShoppingItems([other]).filter((group) => group.items.length)).toEqual([
			{ section: 'Other', items: [other] }
		]);
	});

	it('selects the next focus target from visible order after a row leaves the state', () => {
		const visible = [shared, weekly, manual];
		expect(shoppingItemKey(shared)).toBe('entries:1,2');
		expect(nextVisibleShoppingKey(visible, shoppingItemKey(shared))).toBe(shoppingItemKey(weekly));
		expect(nextVisibleShoppingKey(visible, shoppingItemKey(weekly))).toBe(shoppingItemKey(manual));
		expect(nextVisibleShoppingKey(visible, shoppingItemKey(manual))).toBe(shoppingItemKey(weekly));
		expect(nextVisibleShoppingKey([shared], shoppingItemKey(shared))).toBeNull();
		expect(nextVisibleShoppingKey([], 'entries:1')).toBeNull();
	});
});
