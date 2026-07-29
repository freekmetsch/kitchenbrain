import { describe, expect, it } from 'vitest';
import type { ShoppingListItem, ShoppingListSource } from '$lib/components/shopping/types';
import {
	filterShoppingItems,
	getShoppingFilterOptions,
	groupShoppingBoardItems,
	nextVisibleShoppingKey,
	projectShoppingStates,
	shoppingItemKey
} from './shopping_list_view';

function source(
	overrides: Partial<ShoppingListSource> & Pick<ShoppingListSource, 'sourceKind'>
): ShoppingListSource {
	return {
		id: 1,
		revision: 1,
		sourceKey: 'manual:1',
		recipeId: null,
		recipeSlug: null,
		recipeTitle: null,
		recipeRevision: null,
		ingredientId: null,
		recurringItemId: null,
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
		expect(
			getShoppingFilterOptions([
				...(shared.sources ?? []),
				...(weekly.sources ?? []),
				...(manual.sources ?? []),
				...(shared.sources ?? [])
			])
		).toEqual({
			meals: ['Soep', 'Pasta'],
			hasWeekly: true
		});
	});

	it('keeps canonical meal order independent from pending and completed item order', () => {
		const canonical = [
			source({ id: 20, sourceKind: 'recipe', mealNames: ['Primary'] }),
			source({ id: 21, sourceKind: 'recipe', mealNames: ['Secondary'] })
		];
		expect(getShoppingFilterOptions(canonical).meals).toEqual(['Primary', 'Secondary']);
		expect(
			getShoppingFilterOptions([canonical[1], canonical[0]]).meals
		).toEqual(['Secondary', 'Primary']);
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
			{ kind: 'meal', mealName: 'Soep' }
		);
		expect(states.active).toEqual([pendingShared]);
		expect(states.covered).toEqual([coveredShared]);
		expect(states.done).toEqual([doneShared]);
	});

	it('preserves stable List order without mutating canonical items', () => {
		const input = [manual, shared, weekly];
		const before = [...input];
		const states = projectShoppingStates(input, [], { kind: 'all' });
		expect(states.active).toEqual(input);
		expect(input).toEqual(before);
	});

	it('builds Weekly, Shared, recipe, and other ledger sections without duplicates', () => {
		const weeklyRecipe = item('boter', [
			source({ id: 10, sourceKind: 'weekly' }),
			source({ id: 11, sourceKind: 'recipe', mealNames: ['Soep'] })
		]);
		const soupOnly = item('bouillon', [
			source({ id: 12, sourceKind: 'recipe', mealNames: ['Soep'] })
		]);
		const sections = groupShoppingBoardItems(
			[manual, shared, soupOnly, weeklyRecipe, weekly],
			{ kind: 'all' },
			['Soep', 'Pasta']
		);

		expect(sections.map((section) => section.kind)).toEqual([
			'weekly',
			'shared',
			'meal',
			'other'
		]);
		expect(sections.map((section) => section.items.map((entry) => entry.name))).toEqual([
			['boter', 'melk'],
			['tomaten'],
			['bouillon'],
			['lucifers']
		]);
		expect(sections.flatMap((section) => section.items)).toHaveLength(5);
	});

	it('keeps filtered rows in one matching source section', () => {
		expect(
			groupShoppingBoardItems([weekly], { kind: 'weekly' }, ['Soep'])
		).toEqual([{ kind: 'weekly', key: 'weekly', mealName: null, items: [weekly] }]);
		expect(
			groupShoppingBoardItems([shared], { kind: 'meal', mealName: 'Pasta' }, ['Soep', 'Pasta'])
		).toEqual([{ kind: 'meal', key: 'meal:Pasta', mealName: 'Pasta', items: [shared] }]);
	});

	it('omits an empty Weekly section from All without removing its filtered projection', () => {
		expect(groupShoppingBoardItems([manual], { kind: 'all' }, [])).toEqual([
			{ kind: 'other', key: 'other', mealName: null, items: [manual] }
		]);
		expect(groupShoppingBoardItems([], { kind: 'weekly' }, [])).toEqual([
			{ kind: 'weekly', key: 'weekly', mealName: null, items: [] }
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
