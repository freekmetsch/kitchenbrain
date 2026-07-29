import { describe, expect, it, vi } from 'vitest';
import type { ShoppingListItem, ShoppingListSource } from './types';
import {
	createShoppingListController,
	type ShoppingFocusIntent,
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
		sourceKey: `${sourceKind}:${id}`,
		sourceKind,
		recipeId: null,
		recipeSlug: null,
		recipeTitle: null,
		recipeRevision: null,
		ingredientId: null,
		recurringItemId: null,
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
	const focus = vi.fn<(intent: ShoppingFocusIntent) => Promise<void>>(async () => {});
	const undo = vi.fn<(message: string, action: () => void) => void>();
	const error = vi.fn<(message: string) => void>();
	const waitForMotion = vi.fn<() => Promise<void>>(async () => {});
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
		waitForMotion,
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
		waitForMotion,
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
	it('keeps filters isolated per instance and resets an invalidated meal filter', () => {
		const soupSource = source(1, 'recipe', { mealNames: ['Soup'] });
		const soup = item('tomatoes', 1, [soupSource]);
		const first = harness([soup]);
		const second = harness([item('milk', 2, [source(2, 'weekly')])]);

		first.controller.setFilter({ kind: 'meal', mealName: 'Soup' });

		expect(first.controller.filter).toEqual({ kind: 'meal', mealName: 'Soup' });
		expect(second.controller.filter).toEqual({ kind: 'all' });

		first.setPending([]);
		expect(first.controller.reconcileFilter()).toBe(false);
		expect(first.controller.filterOptions.meals).toContain('Soup');
		first.setSources([]);
		expect(first.controller.reconcileFilter()).toBe(true);
		expect(first.controller.filter).toEqual({ kind: 'all' });
		expect(second.controller.filter).toEqual({ kind: 'all' });
	});

	it('keeps canonical source order through check, undo, source add, and source removal', async () => {
		const primarySource = source(1, 'recipe', { mealNames: ['Primary'] });
		const secondarySource = source(2, 'recipe', { mealNames: ['Secondary'] });
		const primary = item('tomatoes', 1, [primarySource]);
		const secondary = item('beans', 2, [secondarySource]);
		const test = harness([primary, secondary]);
		test.setSources([primarySource, secondarySource]);

		expect(test.controller.filterOptions.meals).toEqual(['Primary', 'Secondary']);
		await test.controller.toggleBought(primary);
		expect(test.controller.filterOptions.meals).toEqual(['Primary', 'Secondary']);
		await test.undo.mock.calls[0][1]();
		expect(test.controller.filterOptions.meals).toEqual(['Primary', 'Secondary']);

		const tertiarySource = source(3, 'recipe', { mealNames: ['Tertiary'] });
		test.setSources([primarySource, secondarySource, tertiarySource]);
		expect(test.controller.filterOptions.meals).toEqual(['Primary', 'Secondary', 'Tertiary']);
		test.setSources([secondarySource, tertiarySource]);
		expect(test.controller.filterOptions.meals).toEqual(['Secondary', 'Tertiary']);
	});

	it('moves focus through visible order and restores the original row through undo', async () => {
		const tomatoes = item('tomatoes', 1, [source(1, 'manual')]);
		const milk = item('milk', 2, [source(2, 'weekly')]);
		const bread = item('bread', 3, [source(3, 'manual')]);
		const test = harness([tomatoes, milk, bread]);

		await test.controller.toggleBought(milk);

		expect(test.focus).toHaveBeenLastCalledWith({
			key: 'entries:1',
			mode: 'preserve'
		});
		expect(test.controller.shoppingStatus).toBe('bought:milk:2');
		expect(test.undo).toHaveBeenCalledTimes(1);

		const undoAction = test.undo.mock.calls[0][1];
		await undoAction();

		expect(test.focus).toHaveBeenLastCalledWith({
			key: 'entries:2',
			mode: 'reveal'
		});
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

		expect(test.focus).toHaveBeenCalledWith({
			key: 'entries:1',
			mode: 'reveal'
		});
		expect(failing.shoppingStatus).toBe('');
		expect(test.undo).not.toHaveBeenCalled();
	});

	it('locks one item through its motion window so rapid activation sends one mutation', async () => {
		const tomatoes = item('tomatoes', 1, [source(1, 'manual')]);
		const test = harness([tomatoes]);
		let releaseMotion!: () => void;
		const motion = new Promise<void>((resolve) => {
			releaseMotion = resolve;
		});
		const toggle = vi.fn(test.dependencies.onToggleBought);
		const controller = createShoppingListController({
			...test.dependencies,
			onToggleBought: toggle,
			waitForMotion: () => motion
		});

		const first = controller.toggleBought(tomatoes);
		await Promise.resolve();
		await controller.toggleBought(tomatoes);

		expect(toggle).toHaveBeenCalledTimes(1);
		expect(controller.itemLocked('entries:1')).toBe(true);
		releaseMotion();
		await first;
		expect(controller.itemLocked('entries:1')).toBe(false);
	});

	it('keeps the same focus key when restoring an item from the completed list', async () => {
		const tomatoes = item('tomatoes', 1, [source(1, 'manual')], { bought: true });
		const test = harness([], [tomatoes]);

		await test.controller.toggleBought(tomatoes);

		expect(test.focus).toHaveBeenLastCalledWith({
			key: 'entries:1',
			mode: 'reveal'
		});
		expect(test.controller.shoppingStatus).toBe('not-bought:tomatoes:1');
	});

	it('keeps manual item actions local to the selected row', () => {
		const entry = item('tomatoes', 1, [source(1, 'manual')]);
		const test = harness([entry]);

		test.controller.openActions(entry);
		expect(test.controller.selectedItem).toBe(entry);
		expect(test.controller.itemActionOpen).toBe(true);
		test.controller.itemActionOpen = false;
		test.controller.handleActionClose();
		expect(test.controller.selectedItem).toBeNull();
	});

	it('coordinates empty, filtered-empty, active, covered-only, and complete modes', () => {
		const test = harness();
		expect(test.controller.viewMode).toBe('empty');
		expect(test.controller.filterOptions.hasWeekly).toBe(true);
		test.controller.setFilter({ kind: 'weekly' });
		expect(test.controller.viewMode).toBe('filter-empty');
		test.controller.setFilter({ kind: 'all' });

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
