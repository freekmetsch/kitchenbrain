import {
	getShoppingFilterOptions,
	groupShoppingItems,
	nextVisibleShoppingKey,
	projectShoppingStates,
	shoppingItemKey,
	type ShoppingListFilter,
	type ShoppingListSort
} from '$lib/shopping_list_view';
import type { ShoppingListItem, ShoppingListSource } from './types';

export type RecurringShoppingItem = {
	id: number;
	revision: number;
	name: string;
	amount: string | null;
	unit: string | null;
	entryId: number | null;
	entryRevision: number | null;
	included: boolean;
	bought: boolean;
};

export type LegacyShoppingItem = {
	id: number;
	revision: number;
	name: string;
	term: string;
	amount: string | null;
	unit: string | null;
	candidates: Array<{ id: number; revision: number; label: string }>;
};

export type ShoppingListViewMode =
	| 'empty'
	| 'filter-empty'
	| 'active'
	| 'complete'
	| 'covered-only';

type ShoppingListMessages = {
	bought: (name: string, count: number) => string;
	notBought: (name: string, count: number) => string;
	removed: (name: string) => string;
	restoreFailed: () => string;
};

export type ShoppingListControllerDependencies = {
	pending: () => ShoppingListItem[];
	done: () => ShoppingListItem[];
	sources: () => ShoppingListSource[];
	recurring: () => RecurringShoppingItem[];
	legacy: () => LegacyShoppingItem[];
	emptyState: () => 'no_meals' | 'nothing_needed';
	onToggleBought: (item: ShoppingListItem) => Promise<boolean>;
	onDeleteManual: (source: ShoppingListSource) => Promise<boolean>;
	onRestoreManual: (source: ShoppingListSource) => Promise<boolean>;
	focus: (key: string | null) => Promise<void>;
	settle: () => Promise<void>;
	openWeeklyManager: () => Promise<void>;
	notifyUndo: (message: string, action: () => void | Promise<void>) => void;
	notifyError: (message: string) => void;
	messages: ShoppingListMessages;
};

class ShoppingListController {
	filter = $state<ShoppingListFilter>({ kind: 'all' });
	sort = $state<ShoppingListSort>('list');
	sourceSheetOpen = $state(false);
	selectedSource = $state<ShoppingListSource | null>(null);
	itemActionOpen = $state(false);
	selectedItem = $state<ShoppingListItem | null>(null);
	rulesOpen = $state(false);
	rulesScope = $state<'excluded' | 'all'>('all');
	listOptionsOpen = $state(false);
	pendingListOptionsAction = $state<'weekly' | 'rules' | null>(null);
	pendingSource = $state<ShoppingListSource | null>(null);
	openWeeklyAfterAction = $state(false);
	actionPending = $state(false);
	basketOpen = $state(false);
	shoppingStatus = $state('');

	readonly #dependencies: ShoppingListControllerDependencies;

	constructor(dependencies: ShoppingListControllerDependencies) {
		this.#dependencies = dependencies;
	}

	get pending() {
		return this.#dependencies.pending();
	}

	get done() {
		return this.#dependencies.done();
	}

	get recurring() {
		return this.#dependencies.recurring();
	}

	get legacy() {
		return this.#dependencies.legacy();
	}

	get emptyState() {
		return this.#dependencies.emptyState();
	}

	get filterOptions() {
		return getShoppingFilterOptions([...this.pending, ...this.done]);
	}

	get projected() {
		return projectShoppingStates(this.pending, this.done, this.filter, this.sort);
	}

	get activePending() {
		return this.projected.active;
	}

	get coveredPending() {
		return this.projected.covered;
	}

	get completed() {
		return this.projected.done;
	}

	get activeGroups() {
		return this.sort === 'store'
			? groupShoppingItems(this.activePending).filter((group) => group.items.length)
			: [{ section: null, items: this.activePending }];
	}

	get recipeSources() {
		return this.#dependencies.sources().filter((source) => source.sourceKind === 'recipe');
	}

	get excludedRecipeSources() {
		return this.recipeSources.filter((source) => !source.included);
	}

	get visibleRuleSources() {
		return this.rulesScope === 'excluded' ? this.excludedRecipeSources : this.recipeSources;
	}

	get filterHasResults() {
		return this.activePending.length + this.coveredPending.length + this.completed.length > 0;
	}

	get viewMode(): ShoppingListViewMode {
		if (this.pending.length === 0 && this.done.length === 0) return 'empty';
		if (!this.filterHasResults) return 'filter-empty';
		if (this.activePending.length) return 'active';
		if (this.completed.length) return 'complete';
		return 'covered-only';
	}

	setFilter(filter: ShoppingListFilter) {
		this.filter = filter;
	}

	setSort(sort: ShoppingListSort) {
		this.sort = sort;
	}

	reconcileFilter(): boolean {
		const invalid =
			(this.filter.kind === 'weekly' && !this.filterOptions.hasWeekly) ||
			(this.filter.kind === 'meal' &&
				!this.filterOptions.meals.includes(this.filter.mealName));
		if (!invalid) return false;
		this.filter = { kind: 'all' };
		return true;
	}

	filterIs(candidate: ShoppingListFilter): boolean {
		return (
			candidate.kind === this.filter.kind &&
			(candidate.kind !== 'meal' ||
				(this.filter.kind === 'meal' && candidate.mealName === this.filter.mealName))
		);
	}

	openActions(item: ShoppingListItem) {
		this.selectedItem = item;
		this.itemActionOpen = true;
	}

	editSourceAfterClose(source: ShoppingListSource, owner: 'actions' | 'rules') {
		this.pendingSource = source;
		if (owner === 'actions') this.itemActionOpen = false;
		else this.rulesOpen = false;
	}

	async handleActionClose() {
		if (this.itemActionOpen) return;
		if (this.pendingSource) {
			this.selectedSource = this.pendingSource;
			this.pendingSource = null;
			await this.#dependencies.settle();
			this.sourceSheetOpen = true;
		} else if (this.openWeeklyAfterAction) {
			this.openWeeklyAfterAction = false;
			await this.#dependencies.settle();
			await this.#dependencies.openWeeklyManager();
		}
		if (!this.itemActionOpen) this.selectedItem = null;
	}

	async handleRulesClose() {
		if (this.rulesOpen || !this.pendingSource) return;
		this.selectedSource = this.pendingSource;
		this.pendingSource = null;
		await this.#dependencies.settle();
		this.sourceSheetOpen = true;
	}

	openRules(scope: 'excluded' | 'all' = 'all') {
		this.rulesScope =
			scope === 'excluded' && this.excludedRecipeSources.length ? 'excluded' : 'all';
		this.rulesOpen = true;
	}

	openListOptions() {
		this.pendingListOptionsAction = null;
		this.listOptionsOpen = true;
	}

	openWeeklyAfterListOptions() {
		this.pendingListOptionsAction = 'weekly';
		this.listOptionsOpen = false;
	}

	openRulesAfterListOptions() {
		this.pendingListOptionsAction = 'rules';
		this.listOptionsOpen = false;
	}

	async handleListOptionsClose() {
		if (this.listOptionsOpen || !this.pendingListOptionsAction) return;
		const action = this.pendingListOptionsAction;
		this.pendingListOptionsAction = null;
		await this.#dependencies.settle();
		if (action === 'weekly') {
			await this.#dependencies.openWeeklyManager();
		} else {
			this.openRules();
		}
	}

	openWeeklyAfterActions() {
		this.openWeeklyAfterAction = true;
		this.itemActionOpen = false;
	}

	async undoBought(item: ShoppingListItem, key: string) {
		const restored = await this.#dependencies.onToggleBought(item);
		if (!restored) return;
		await this.#dependencies.focus(key);
		this.shoppingStatus = item.bought
			? this.#dependencies.messages.bought(item.name, this.activePending.length)
			: this.#dependencies.messages.notBought(item.name, this.activePending.length);
	}

	async toggleBought(item: ShoppingListItem) {
		const wasBought = item.bought;
		const key = shoppingItemKey(item);
		const before = wasBought ? [...this.completed] : [...this.activePending];
		const nextKey = wasBought ? key : nextVisibleShoppingKey(before, key);
		const saved = await this.#dependencies.onToggleBought(item);
		if (!saved) {
			await this.#dependencies.focus(key);
			return;
		}
		await this.#dependencies.focus(nextKey);
		this.shoppingStatus = wasBought
			? this.#dependencies.messages.notBought(item.name, this.activePending.length)
			: this.#dependencies.messages.bought(item.name, this.activePending.length);
		this.#dependencies.notifyUndo(this.shoppingStatus, () => this.undoBought(item, key));
	}

	async removeManual(item: ShoppingListItem, source: ShoppingListSource) {
		if (this.actionPending) return;
		this.actionPending = true;
		const removed = await this.#dependencies.onDeleteManual(source);
		this.actionPending = false;
		if (!removed) return;
		this.itemActionOpen = false;
		this.#dependencies.notifyUndo(this.#dependencies.messages.removed(item.name), () =>
			this.#dependencies.onRestoreManual(source).then((restored) => {
				if (!restored) {
					this.#dependencies.notifyError(this.#dependencies.messages.restoreFailed());
				}
			})
		);
	}
}

export function createShoppingListController(
	dependencies: ShoppingListControllerDependencies
): ShoppingListController {
	return new ShoppingListController(dependencies);
}
