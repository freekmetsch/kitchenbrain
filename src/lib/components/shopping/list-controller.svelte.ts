import {
	getShoppingFilterOptions,
	groupShoppingBoardItems,
	nextVisibleShoppingKey,
	projectShoppingStates,
	shoppingItemKey,
	type ShoppingListFilter
} from '$lib/shopping_list_view';
import type { ShoppingListItem, ShoppingListSource } from './types';

export type RecurringShoppingItem = {
	id: number;
	revision: number;
	name: string;
	amount: string | null;
	unit: string | null;
	startWeek: string;
	endWeek: string | null;
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

export type ShoppingFocusIntent = {
	key: string | null;
	mode: 'preserve' | 'reveal';
};

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
	focus: (intent: ShoppingFocusIntent) => Promise<void>;
	waitForMotion: () => Promise<void>;
	notifyUndo: (message: string, action: () => void | Promise<void>) => void;
	notifyError: (message: string) => void;
	messages: ShoppingListMessages;
};

class ShoppingListController {
	filter = $state<ShoppingListFilter>({ kind: 'all' });
	itemActionOpen = $state(false);
	selectedItem = $state<ShoppingListItem | null>(null);
	actionPending = $state(false);
	basketOpen = $state(false);
	shoppingStatus = $state('');
	lockedItemKeys = $state<string[]>([]);

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
		return {
			meals: getShoppingFilterOptions(this.#dependencies.sources()).meals,
			hasWeekly: true
		};
	}

	get projected() {
		return projectShoppingStates(this.pending, this.done, this.filter);
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
		return groupShoppingBoardItems(
			this.activePending,
			this.filter,
			this.filterOptions.meals
		);
	}

	get activeFocusItems() {
		return this.activeGroups.flatMap((group) => group.items);
	}

	get recipeSources() {
		return this.#dependencies.sources().filter((source) => source.sourceKind === 'recipe');
	}

	get excludedRecipeSources() {
		return this.recipeSources.filter((source) => !source.included);
	}

	get filterHasResults() {
		return this.activePending.length + this.coveredPending.length + this.completed.length > 0;
	}

	get viewMode(): ShoppingListViewMode {
		if (this.pending.length === 0 && this.done.length === 0) {
			return this.filter.kind === 'all' ? 'empty' : 'filter-empty';
		}
		if (!this.filterHasResults) return 'filter-empty';
		if (this.activePending.length) return 'active';
		if (this.completed.length) return 'complete';
		return 'covered-only';
	}

	setFilter(filter: ShoppingListFilter) {
		this.filter = filter;
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

	itemLocked(key: string): boolean {
		return this.lockedItemKeys.includes(key);
	}

	#setItemLocked(key: string, value: boolean) {
		this.lockedItemKeys = value
			? [...new Set([...this.lockedItemKeys, key])]
			: this.lockedItemKeys.filter((candidate) => candidate !== key);
	}

	openActions(item: ShoppingListItem) {
		this.selectedItem = item;
		this.itemActionOpen = true;
	}

	handleActionClose() {
		if (!this.itemActionOpen) this.selectedItem = null;
	}

	async undoBought(item: ShoppingListItem, key: string) {
		if (this.itemLocked(key)) return;
		this.#setItemLocked(key, true);
		const restored = await this.#dependencies.onToggleBought(item);
		if (!restored) {
			this.#setItemLocked(key, false);
			return;
		}
		this.shoppingStatus = item.bought
			? this.#dependencies.messages.bought(item.name, this.activePending.length)
			: this.#dependencies.messages.notBought(item.name, this.activePending.length);
		await this.#dependencies.waitForMotion();
		this.#setItemLocked(key, false);
		await this.#dependencies.focus({ key, mode: 'reveal' });
	}

	async toggleBought(item: ShoppingListItem) {
		const wasBought = item.bought;
		const key = shoppingItemKey(item);
		if (this.itemLocked(key)) return;
		this.#setItemLocked(key, true);
		const before = wasBought ? [...this.completed] : [...this.activeFocusItems];
		const nextKey = wasBought ? key : nextVisibleShoppingKey(before, key);
		const saved = await this.#dependencies.onToggleBought(item);
		if (!saved) {
			this.#setItemLocked(key, false);
			await this.#dependencies.focus({ key, mode: 'reveal' });
			return;
		}
		const focusIntent: ShoppingFocusIntent = {
			key: nextKey,
			mode: wasBought || nextKey === null ? 'reveal' : 'preserve'
		};
		if (focusIntent.key !== key) {
			await this.#dependencies.focus(focusIntent);
		}
		this.shoppingStatus = wasBought
			? this.#dependencies.messages.notBought(item.name, this.activePending.length)
			: this.#dependencies.messages.bought(item.name, this.activePending.length);
		await this.#dependencies.waitForMotion();
		this.#setItemLocked(key, false);
		if (focusIntent.key === key) {
			await this.#dependencies.focus(focusIntent);
		}
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
