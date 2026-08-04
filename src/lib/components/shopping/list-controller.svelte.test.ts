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
		onChangeSourceTerm: async () => 'saved',
		onChangeSourceNeed: async () => 'saved',
		onSetSourceIncluded: async () => 'saved',
		focus,
		focusSource: async () => {},
		waitForMotion,
		notifyUndo: undo,
		notifyError: error,
		notifySuccess: () => {},
		messages: {
			bought: (name, count) => `bought:${name}:${count}`,
			notBought: (name, count) => `not-bought:${name}:${count}`,
			removed: (name) => `removed:${name}`,
			restoreFailed: () => 'restore-failed',
			choiceSaved: () => 'saved',
			choiceStale: () => 'stale',
			choiceFailed: () => 'failed',
			choiceMoved: (name, destination) => `${name}:${destination}`,
			filterAll: () => 'all',
			optional: () => 'optional',
			inStock: () => 'in-stock'
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
	it('keeps optional and stocked recipe sources in separate destinations', () => {
		const optional = source(1, 'recipe', { included: false, optional: true });
		const stocked = source(2, 'recipe', { included: false, staple: true });
		const manuallyExcluded = source(3, 'recipe', { included: false });
		const test = harness();
		test.setSources([optional, stocked, manuallyExcluded]);

		expect(test.controller.optionalRecipeSources).toEqual([optional]);
		expect(test.controller.stockedRecipeSources).toEqual([stocked]);
	});

	it('adds an optional source for this week and undoes with the refreshed revision', async () => {
		const optional = source(1, 'recipe', {
			included: false,
			optional: true,
			name: 'basil'
		});
		const refreshed = { ...optional, included: true, revision: 2 };
		const test = harness();
		test.setSources([optional]);
		const setIncluded = vi.fn(async () => {
			if (setIncluded.mock.calls.length === 1) test.setSources([refreshed]);
			return 'saved' as const;
		});
		const focusSource = vi.fn<(sourceKey: string) => Promise<void>>(async () => {});
		const controller = createShoppingListController({
			...test.dependencies,
			onSetSourceIncluded: setIncluded,
			focusSource
		});

		await expect(controller.setSourceIncluded(optional, true)).resolves.toBe(true);
		expect(setIncluded).toHaveBeenNthCalledWith(1, optional, true);
		expect(focusSource).toHaveBeenCalledWith(optional.sourceKey);
		expect(test.undo).toHaveBeenCalledTimes(1);

		await test.undo.mock.calls[0][1]();
		expect(setIncluded).toHaveBeenNthCalledWith(2, refreshed, false);
	});

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

	it('keeps a term choice busy until regrouping settles, then focuses the surviving source', async () => {
		const original = source(1, 'recipe', {
			term: 'tomatoes',
			approvedTerms: ['tomatoes', 'cherry tomatoes']
		});
		const test = harness([item('tomatoes', 1, [original])]);
		let finishMutation!: (status: 'saved') => void;
		const mutation = new Promise<'saved'>((resolve) => {
			finishMutation = resolve;
		});
		let finishMotion!: () => void;
		const motion = new Promise<void>((resolve) => {
			finishMotion = resolve;
		});
		const changeTerm = vi.fn(() => mutation);
		const focusSource = vi.fn<(sourceKey: string) => Promise<void>>(async () => {});
		const notifySuccess = vi.fn<(message: string) => void>();
		const controller = createShoppingListController({
			...test.dependencies,
			onChangeSourceTerm: changeTerm,
			focusSource,
			waitForMotion: () => motion,
			notifySuccess
		});

		const changing = controller.changeTerm(original, 'cherry tomatoes');
		await Promise.resolve();

		expect(changeTerm).toHaveBeenCalledWith(original, 'cherry tomatoes');
		expect(controller.sourcePending(original.sourceKey)).toBe(true);
		finishMutation('saved');
		await Promise.resolve();
		await Promise.resolve();
		expect(controller.sourcePending(original.sourceKey)).toBe(true);
		expect(focusSource).not.toHaveBeenCalled();

		finishMotion();
		await expect(changing).resolves.toBe(true);
		expect(controller.sourcePending(original.sourceKey)).toBe(false);
		expect(notifySuccess).toHaveBeenCalledWith('saved');
		expect(focusSource).toHaveBeenCalledWith(original.sourceKey);
	});

	it('releases a stale term choice immediately and restores source focus', async () => {
		const original = source(1, 'recipe', {
			term: 'tomatoes',
			approvedTerms: ['tomatoes', 'cherry tomatoes']
		});
		const test = harness([item('tomatoes', 1, [original])]);
		const focusSource = vi.fn<(sourceKey: string) => Promise<void>>(async () => {});
		const notifyError = vi.fn<(message: string) => void>();
		const waitForMotion = vi.fn<() => Promise<void>>(async () => {});
		const controller = createShoppingListController({
			...test.dependencies,
			onChangeSourceTerm: async () => 'stale' as const,
			focusSource,
			waitForMotion,
			notifyError
		});

		await expect(controller.changeTerm(original, 'cherry tomatoes')).resolves.toBe(false);

		expect(controller.sourcePending(original.sourceKey)).toBe(false);
		expect(waitForMotion).not.toHaveBeenCalled();
		expect(notifyError).toHaveBeenCalledWith('stale');
		expect(focusSource).toHaveBeenCalledWith(original.sourceKey);
	});

	it('normalizes a rejected term choice to failure and releases the source lock', async () => {
		const original = source(1, 'recipe', {
			term: 'tomatoes',
			approvedTerms: ['tomatoes', 'cherry tomatoes']
		});
		const test = harness([item('tomatoes', 1, [original])]);
		const focusSource = vi.fn<(sourceKey: string) => Promise<void>>(async () => {});
		const notifyError = vi.fn<(message: string) => void>();
		const controller = createShoppingListController({
			...test.dependencies,
			onChangeSourceTerm: async () => {
				throw new Error('network escaped its adapter');
			},
			focusSource,
			notifyError
		});

		await expect(controller.changeTerm(original, 'cherry tomatoes')).resolves.toBe(false);

		expect(controller.sourcePending(original.sourceKey)).toBe(false);
		expect(notifyError).toHaveBeenCalledWith('failed');
		expect(focusSource).toHaveBeenCalledWith(original.sourceKey);
	});

	it('locks a recipe need choice through its move, then focuses and offers undo', async () => {
		const original = source(1, 'recipe', { recipeId: 10, name: 'tomatoes' });
		const sibling = source(2, 'recipe', { recipeId: 10, name: 'basil' });
		const test = harness([item('tomatoes', 1, [original])]);
		test.setSources([original, sibling]);
		let finishMutation!: (status: 'saved') => void;
		const mutation = new Promise<'saved'>((resolve) => {
			finishMutation = resolve;
		});
		let finishMotion!: () => void;
		const motion = new Promise<void>((resolve) => {
			finishMotion = resolve;
		});
		const changeNeed = vi.fn(() => mutation);
		const focusSource = vi.fn<(sourceKey: string) => Promise<void>>(async () => {});
		const controller = createShoppingListController({
			...test.dependencies,
			onChangeSourceNeed: changeNeed,
			focusSource,
			waitForMotion: () => motion
		});

		const changing = controller.changeNeed(original, 'optional');
		await Promise.resolve();

		expect(changeNeed).toHaveBeenCalledWith(original, 'optional');
		expect(controller.sourcePending(original.sourceKey)).toBe(true);
		expect(controller.recipePending(original.recipeId)).toBe(true);
		finishMutation('saved');
		await Promise.resolve();
		await Promise.resolve();
		expect(controller.shoppingStatus).toBe('tomatoes:optional');
		expect(controller.sourcePending(original.sourceKey)).toBe(true);
		expect(focusSource).not.toHaveBeenCalled();
		expect(test.undo).not.toHaveBeenCalled();

		finishMotion();
		await expect(changing).resolves.toBe(true);
		expect(controller.sourcePending(original.sourceKey)).toBe(false);
		expect(controller.recipePending(original.recipeId)).toBe(false);
		expect(focusSource).toHaveBeenCalledWith(original.sourceKey);
		expect(test.undo).toHaveBeenCalledTimes(1);
	});

	it('blocks sibling term choices while their recipe need is moving', async () => {
		const original = source(1, 'recipe', { recipeId: 10, name: 'tomatoes' });
		const sibling = source(2, 'recipe', {
			recipeId: 10,
			name: 'basil',
			term: 'basil',
			approvedTerms: ['basil', 'thai basil']
		});
		const test = harness([item('tomatoes', 1, [original, sibling])]);
		let finishNeed!: (status: 'saved') => void;
		const pendingNeed = new Promise<'saved'>((resolve) => {
			finishNeed = resolve;
		});
		const changeTerm = vi.fn(async () => 'saved' as const);
		const controller = createShoppingListController({
			...test.dependencies,
			onChangeSourceNeed: () => pendingNeed,
			onChangeSourceTerm: changeTerm
		});

		const moving = controller.changeNeed(original, 'optional');
		await Promise.resolve();

		await expect(controller.changeTerm(sibling, 'thai basil')).resolves.toBe(true);
		expect(changeTerm).not.toHaveBeenCalled();

		finishNeed('saved');
		await expect(moving).resolves.toBe(true);
	});

	it('keeps each concurrent recipe move attached to its own undo message', async () => {
		const tomatoes = source(1, 'recipe', { recipeId: 10, name: 'tomatoes' });
		const basil = source(2, 'recipe', { recipeId: 20, name: 'basil' });
		const test = harness([item('tomatoes', 1, [tomatoes]), item('basil', 2, [basil])]);
		let releaseTomatoesFocus!: () => void;
		const tomatoesFocus = new Promise<void>((resolve) => {
			releaseTomatoesFocus = resolve;
		});
		let reachTomatoesFocus!: () => void;
		const tomatoesFocusReached = new Promise<void>((resolve) => {
			reachTomatoesFocus = resolve;
		});
		const focusSource = vi.fn(async (sourceKey: string) => {
			if (sourceKey !== tomatoes.sourceKey) return;
			reachTomatoesFocus();
			await tomatoesFocus;
		});
		const controller = createShoppingListController({
			...test.dependencies,
			focusSource
		});

		const movingTomatoes = controller.changeNeed(tomatoes, 'optional');
		await tomatoesFocusReached;
		await expect(controller.changeNeed(basil, 'optional')).resolves.toBe(true);
		releaseTomatoesFocus();
		await expect(movingTomatoes).resolves.toBe(true);

		expect(test.undo.mock.calls.map(([message]) => message)).toEqual([
			'basil:optional',
			'tomatoes:optional'
		]);
	});

	it('undoes a moved source with the refreshed source revision', async () => {
		const original = source(1, 'recipe', {
			recipeId: 10,
			revision: 1,
			name: 'tomatoes'
		});
		const refreshed = { ...original, revision: 2, optional: true };
		const test = harness([item('tomatoes', 1, [original])]);
		test.setSources([original]);
		const changeNeed = vi.fn(async () => {
			if (changeNeed.mock.calls.length === 1) test.setSources([refreshed]);
			return 'saved' as const;
		});
		const controller = createShoppingListController({
			...test.dependencies,
			onChangeSourceNeed: changeNeed
		});

		await expect(controller.changeNeed(original, 'optional')).resolves.toBe(true);
		await test.undo.mock.calls[0][1]();

		expect(changeNeed).toHaveBeenNthCalledWith(1, original, 'optional');
		expect(changeNeed).toHaveBeenNthCalledWith(2, refreshed, 'required');
		expect(test.undo).toHaveBeenCalledTimes(1);
	});

	it('suppresses no-op term and need choices', async () => {
		const original = source(1, 'recipe', {
			term: 'tomatoes',
			approvedTerms: ['tomatoes', 'cherry tomatoes']
		});
		const test = harness([item('tomatoes', 1, [original])]);
		const changeTerm = vi.fn(test.dependencies.onChangeSourceTerm);
		const changeNeed = vi.fn(test.dependencies.onChangeSourceNeed);
		const controller = createShoppingListController({
			...test.dependencies,
			onChangeSourceTerm: changeTerm,
			onChangeSourceNeed: changeNeed
		});

		await expect(controller.changeTerm(original, original.term)).resolves.toBe(true);
		await expect(controller.changeNeed(original, 'required')).resolves.toBe(true);

		expect(changeTerm).not.toHaveBeenCalled();
		expect(changeNeed).not.toHaveBeenCalled();
		expect(test.undo).not.toHaveBeenCalled();
		expect(test.error).not.toHaveBeenCalled();
	});

	it('clears source and recipe locks when a need choice rejects', async () => {
		const original = source(1, 'recipe', { recipeId: 10, name: 'tomatoes' });
		const test = harness([item('tomatoes', 1, [original])]);
		const focusSource = vi.fn<(sourceKey: string) => Promise<void>>(async () => {});
		const waitForMotion = vi.fn<() => Promise<void>>(async () => {});
		const controller = createShoppingListController({
			...test.dependencies,
			onChangeSourceNeed: async () => {
				throw new Error('network escaped its adapter');
			},
			focusSource,
			waitForMotion
		});

		await expect(controller.changeNeed(original, 'optional')).resolves.toBe(false);

		expect(controller.sourcePending(original.sourceKey)).toBe(false);
		expect(controller.recipePending(original.recipeId)).toBe(false);
		expect(waitForMotion).not.toHaveBeenCalled();
		expect(test.error).toHaveBeenCalledWith('failed');
		expect(focusSource).toHaveBeenCalledWith(original.sourceKey);
		expect(test.undo).not.toHaveBeenCalled();
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
