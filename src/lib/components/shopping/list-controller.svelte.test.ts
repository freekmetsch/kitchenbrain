import { describe, expect, it, vi } from 'vitest';
import type { ShoppingListItem, ShoppingListSource } from './types';
import {
	createShoppingListController,
	type ShoppingListControllerDependencies
} from './list-controller.svelte';

function source(
	id: number,
	sourceKind: ShoppingListSource['sourceKind'],
	overrides: Partial<ShoppingListSource> = {}
): ShoppingListSource {
	return {
		id,
		revision: 1,
		sourceKind,
		recipeId: null,
		recipeSlug: null,
		recipeTitle: null,
		recipeRevision: null,
		ingredientId: null,
		name: `source ${id}`,
		term: `source ${id}`,
		amount: null,
		unit: null,
		component: null,
		mealNames: [],
		approvedTerms: [],
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
	id: number,
	itemSources: ShoppingListSource[],
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
		entryIds: [id],
		sources: itemSources,
		...overrides
	};
}

function harness(initialPending: ShoppingListItem[] = [], initialDone: ShoppingListItem[] = []) {
	let pending = initialPending;
	let done = initialDone;
	let sources = [...pending, ...done].flatMap((entry) => entry.sources ?? []);
	const focus = vi.fn<(key: string | null) => Promise<void>>(async () => {});
	const undo = vi.fn<(message: string, action: () => void) => void>();
	const error = vi.fn<(message: string) => void>();
	const settle = vi.fn(async () => {});
	const openWeeklyManager = vi.fn(async () => {});

	const dependencies: ShoppingListControllerDependencies = {
		pending: () => pending,
		done: () => done,
		sources: () => sources,
		recurring: () => [],
		legacy: () => [],
		emptyState: () => 'nothing_needed',
		onToggleBought: async (entry) => {
			entry.bought = !entry.bought;
			if (entry.bought) {
				pending = pending.filter((candidate) => candidate !== entry);
				done = [...done, entry];
			} else {
				done = done.filter((candidate) => candidate !== entry);
				pending = [...pending, entry];
			}
			return true;
		},
		onDeleteManual: async () => true,
		onRestoreManual: async () => true,
		focus,
		settle,
		openWeeklyManager,
		notifyUndo: undo,
		notifyError: error,
		messages: {
			bought: (name, count) => `bought:${name}:${count}`,
			notBought: (name, count) => `not-bought:${name}:${count}`,
			removed: (name) => `removed:${name}`,
			restoreFailed: () => 'restore-failed'
		}
	};
	const controller = createShoppingListController(dependencies);

	return {
		controller,
		dependencies,
		focus,
		undo,
		error,
		settle,
		openWeeklyManager,
		setPending(value: ShoppingListItem[]) {
			pending = value;
		},
		setDone(value: ShoppingListItem[]) {
			done = value;
		},
		setSources(value: ShoppingListSource[]) {
			sources = value;
		}
	};
}

describe('shopping list controller', () => {
	it('keeps filters and sorting isolated per instance and resets an invalidated meal filter', () => {
		const soupSource = source(1, 'recipe', { mealNames: ['Soup'] });
		const soup = item('tomatoes', 1, [soupSource]);
		const first = harness([soup]);
		const second = harness([item('milk', 2, [source(2, 'weekly')])]);

		first.controller.setFilter({ kind: 'meal', mealName: 'Soup' });
		first.controller.setSort('alpha');

		expect(first.controller.filter).toEqual({ kind: 'meal', mealName: 'Soup' });
		expect(first.controller.sort).toBe('alpha');
		expect(second.controller.filter).toEqual({ kind: 'all' });
		expect(second.controller.sort).toBe('list');

		first.setPending([]);
		expect(first.controller.reconcileFilter()).toBe(true);
		expect(first.controller.filter).toEqual({ kind: 'all' });
		expect(second.controller.filter).toEqual({ kind: 'all' });
	});

	it('moves focus through visible order and restores the original row through undo', async () => {
		const tomatoes = item('tomatoes', 1, [source(1, 'manual')]);
		const milk = item('milk', 2, [source(2, 'weekly')]);
		const bread = item('bread', 3, [source(3, 'manual')]);
		const test = harness([tomatoes, milk, bread]);

		await test.controller.toggleBought(milk);

		expect(test.focus).toHaveBeenLastCalledWith('entries:3');
		expect(test.controller.shoppingStatus).toBe('bought:milk:2');
		expect(test.undo).toHaveBeenCalledTimes(1);

		const undoAction = test.undo.mock.calls[0][1];
		await undoAction();

		expect(test.focus).toHaveBeenLastCalledWith('entries:2');
		expect(test.controller.shoppingStatus).toBe('not-bought:milk:3');
	});

	it('returns focus to the original row when a bought mutation fails', async () => {
		const tomatoes = item('tomatoes', 1, [source(1, 'manual')]);
		const test = harness([tomatoes]);
		const failing = createShoppingListController({
			...test.dependencies,
			onToggleBought: async () => false
		});

		await failing.toggleBought(tomatoes);

		expect(test.focus).toHaveBeenCalledWith('entries:1');
		expect(failing.shoppingStatus).toBe('');
		expect(test.undo).not.toHaveBeenCalled();
	});

	it('keeps the same focus key when restoring an item from the completed list', async () => {
		const tomatoes = item('tomatoes', 1, [source(1, 'manual')], { bought: true });
		const test = harness([], [tomatoes]);

		await test.controller.toggleBought(tomatoes);

		expect(test.focus).toHaveBeenLastCalledWith('entries:1');
		expect(test.controller.shoppingStatus).toBe('not-bought:tomatoes:1');
	});

	it('sequences source, rule, and recurring handoffs only after their owner closes', async () => {
		const recipeSource = source(1, 'recipe');
		const entry = item('tomatoes', 1, [recipeSource]);
		const test = harness([entry]);

		test.controller.openActions(entry);
		test.controller.editSourceAfterClose(recipeSource, 'actions');
		expect(test.controller.itemActionOpen).toBe(false);
		expect(test.controller.sourceSheetOpen).toBe(false);

		await test.controller.handleActionClose();
		expect(test.settle).toHaveBeenCalledTimes(1);
		expect(test.controller.selectedSource).toBe(recipeSource);
		expect(test.controller.sourceSheetOpen).toBe(true);
		expect(test.controller.selectedItem).toBeNull();

		test.controller.sourceSheetOpen = false;
		test.controller.openRules();
		test.controller.editSourceAfterClose(recipeSource, 'rules');
		await test.controller.handleRulesClose();
		expect(test.settle).toHaveBeenCalledTimes(2);
		expect(test.controller.sourceSheetOpen).toBe(true);

		test.controller.sourceSheetOpen = false;
		test.controller.openActions(entry);
		test.controller.openWeeklyAfterActions();
		await test.controller.handleActionClose();
		expect(test.settle).toHaveBeenCalledTimes(3);
		expect(test.openWeeklyManager).toHaveBeenCalledTimes(1);
	});

	it('coordinates empty, filtered-empty, active, covered-only, and complete modes', () => {
		const test = harness();
		expect(test.controller.viewMode).toBe('empty');

		const mealSource = source(1, 'recipe', { mealNames: ['Soup'] });
		const active = item('tomatoes', 1, [mealSource]);
		test.setPending([active]);
		expect(test.controller.viewMode).toBe('active');

		test.controller.setFilter({ kind: 'meal', mealName: 'Pasta' });
		expect(test.controller.viewMode).toBe('filter-empty');

		test.controller.setFilter({ kind: 'all' });
		test.setPending([{ ...active, covered: true }]);
		expect(test.controller.viewMode).toBe('covered-only');

		test.setPending([]);
		test.setDone([{ ...active, bought: true }]);
		expect(test.controller.viewMode).toBe('complete');
	});
});
