import { base } from '$app/paths';
import { invalidateAll } from '$app/navigation';
import { tick, untrack } from 'svelte';
import { rollsUpTo } from '$lib/food_class';
import { patchKeepStocked } from '$lib/keep_stocked';
import { captureRemoval, restoreRemoval, type RemovedListItem } from '$lib/inventory_undo';
import { m } from '$lib/paraglide/messages';
import { toast } from '$lib/stores/toast.svelte';
import {
	composeQty,
	groupMealStock,
	matchesInventoryQuery,
	matchesInventoryQuickView,
	matchesInventoryScope,
	recipeCoverage,
	recipeRelationshipKind
} from './shared';
import type {
	EditDraft,
	HistoryEvent,
	InventoryQuickView,
	InventoryScope,
	Item,
	Kind,
	RecipeLink,
	RecipeMatch,
	RecipeOption,
	Section,
	StapleGhost,
	StockAttention
} from './shared';

type ToastAction = { label: string; run: () => void | Promise<void> };
type ToastOptions = { variant: 'success' | 'error'; action?: ToastAction };
type InventoryDataSource = InventoryControllerData | (() => InventoryControllerData);
type QtySync = { confirmed: number; running: Promise<void> | null };

export type InventoryControllerData = {
	items: Item[];
	recipeLinks: Record<number, RecipeLink>;
	recipeMatches: Record<number, RecipeMatch[]>;
	recipeOptions: RecipeOption[];
	stapleGhosts: StapleGhost[];
	todayIso: string;
	currentWeekStart: string;
};

export type InventoryControllerDependencies = {
	fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
	invalidate: () => Promise<void>;
	patchKeepStocked: (
		slug: string,
		keepStocked: boolean,
		target: number | null
	) => Promise<boolean>;
	showToast: (message: string, options: ToastOptions) => void;
	dismissToast: () => void;
};

const SYNC_FIELDS = [
	'name',
	'qtyText',
	'qtyNum',
	'unit',
	'section',
	'kind',
	'foodClass',
	'madeFromRecipeId',
	'recipeStatus',
	'needsReview',
	'reviewReason',
	'isStaple',
	'expiryDate'
] as const;

export class InventoryController {
	items = $state<Item[]>([]);

	scope = $state<InventoryScope>('meals');
	sectionFilter = $state<Section | 'all'>('all');
	classFilter = $state<string | null>(null);
	reviewOnly = $state(false);
	relationshipReviewOnly = $state(false);
	searchQuery = $state('');
	quickView = $state<InventoryQuickView | null>(null);
	filtersOpen = $state(false);
	searchInput = $state<HTMLInputElement>();

	showAddForm = $state(false);
	editingId = $state<number | null>(null);
	editSheetOpen = $state(false);
	qtyEditId = $state<number | null>(null);
	qtyEditVal = $state('');

	activityOpen = $state(false);
	activityLoading = $state(false);
	activityEvents = $state<HistoryEvent[]>([]);
	historyByItem = $state<Record<number, HistoryEvent[]>>({});

	editDraft = $state<EditDraft>({
		name: '',
		qty: null,
		unit: '',
		kind: '',
		section: 'freezer',
		foodClass: '',
		expiry: '',
		staple: false,
		keepStocked: false,
		target: null
	});
	editSaving = $state(false);

	stapleOutBusy = $state<number | null>(null);
	stapleAdded = $state<number[]>([]);

	linkPickerOpen = $state(false);
	linkPickerItem = $state<Item | null>(null);
	linkSearch = $state('');

	portionEditId = $state<number | null>(null);
	portionEditVal = $state('');

	private readonly readData: () => InventoryControllerData;
	private readonly dependencies: InventoryControllerDependencies;
	private readonly qtySyncByItem = new Map<number, QtySync>();

	constructor(source: InventoryDataSource, dependencies?: InventoryControllerDependencies) {
		this.readData = typeof source === 'function' ? source : () => source;
		this.dependencies = dependencies ?? {
			fetch: (input, init) => globalThis.fetch(input, init),
			invalidate: invalidateAll,
			patchKeepStocked,
			showToast: (message, options) => toast.show(message, options),
			dismissToast: () => toast.dismiss()
		};
		this.items = untrack(() => this.data.items.map((item) => ({ ...item })));
	}

	get data(): InventoryControllerData {
		return this.readData();
	}

	get needsReviewCount(): number {
		return this.items.filter((item) => item.needsReview).length;
	}

	get readyMealCount(): number {
		return this.items.filter((item) =>
			matchesInventoryQuickView(item, this.linkFor(item), 'ready')
		).length;
	}

	get belowTargetGhosts(): StapleGhost[] {
		return this.data.stapleGhosts.filter((ghost) => ghost.target !== null);
	}

	get belowTargetCount(): number {
		const itemCount = this.items.filter((item) =>
			matchesInventoryQuickView(item, this.linkFor(item), 'below_target')
		).length;
		return itemCount + this.belowTargetGhosts.length;
	}

	get hasActiveFilters(): boolean {
		return this.sectionFilter !== 'all' || this.classFilter !== null || this.reviewOnly;
	}

	get filtered(): Item[] {
		return this.items.filter(
			(item) =>
				(this.sectionFilter === 'all' || item.section === this.sectionFilter) &&
				(this.classFilter === null || rollsUpTo(item.foodClass, this.classFilter)) &&
				(!this.reviewOnly || item.needsReview) &&
				(!this.relationshipReviewOnly ||
					(item.kind === 'leftover' &&
						recipeRelationshipKind(item, this.linkFor(item)) === 'unresolved')) &&
				matchesInventoryScope(item, this.scope) &&
				matchesInventoryQuickView(item, this.linkFor(item), this.quickView) &&
				matchesInventoryQuery(this.searchQuery, [
					item.name,
					item.unit,
					item.section,
					item.kind,
					item.foodClass,
					this.linkFor(item)?.title,
					this.shelfLabel(String(this.bucket(item)))
				])
		);
	}

	get mealGroups() {
		return groupMealStock(this.filtered, (item) => this.linkFor(item), this.data.todayIso);
	}

	get visibleMealItems(): Item[] {
		return this.filtered.filter((item) => item.kind === 'leftover');
	}

	get visibleRecipeCoverage() {
		return recipeCoverage(this.visibleMealItems);
	}

	get unresolvedRelationshipCount(): number {
		return this.items.filter(
			(item) =>
				item.kind === 'leftover' &&
				recipeRelationshipKind(item, this.linkFor(item)) === 'unresolved'
		).length;
	}

	get stockRows(): Item[] {
		return [...this.filtered].sort(
			(a, b) =>
				Number(b.needsReview) - Number(a.needsReview) || a.name.localeCompare(b.name)
		);
	}

	get alternateScopeMatch(): boolean {
		return this.items.some(
			(item) =>
				(this.sectionFilter === 'all' || item.section === this.sectionFilter) &&
				(this.classFilter === null || rollsUpTo(item.foodClass, this.classFilter)) &&
				(!this.reviewOnly || item.needsReview) &&
				(!this.relationshipReviewOnly ||
					(item.kind === 'leftover' &&
						recipeRelationshipKind(item, this.linkFor(item)) === 'unresolved')) &&
				!matchesInventoryScope(item, this.scope) &&
				matchesInventoryQuery(this.searchQuery, [
					item.name,
					item.unit,
					item.section,
					item.kind,
					item.foodClass,
					this.linkFor(item)?.title,
					this.shelfLabel(String(this.bucket(item)))
				])
		);
	}

	get editingItem(): Item | null {
		return this.editingId === null
			? null
			: (this.items.find((item) => item.id === this.editingId) ?? null);
	}

	get ghostsVisible(): StapleGhost[] {
		if (
			this.scope !== 'meals' ||
			(this.sectionFilter !== 'all' && this.sectionFilter !== 'freezer') ||
			this.classFilter !== null ||
			this.reviewOnly ||
			this.relationshipReviewOnly ||
			this.quickView === 'ready'
		) {
			return [];
		}
		const ghosts =
			this.quickView === 'below_target' ? this.belowTargetGhosts : this.data.stapleGhosts;
		return ghosts.filter((ghost) =>
			matchesInventoryQuery(this.searchQuery, [
				ghost.title,
				m.inventory_shelf_meals(),
				m.inventory_section_freezer()
			])
		);
	}

	get visibleMealResultCount(): number {
		return (
			this.mealGroups.useNext.length +
			this.mealGroups.stillPlenty.length +
			this.mealGroups.cookAgain.length +
			this.ghostsVisible.length
		);
	}

	get hasUngroupedMealStock(): boolean {
		return (
			this.scope === 'meals' &&
			this.filtered.some(
				(item) =>
					item.kind === 'leftover' &&
					(item.qtyNum ?? 0) <= 0 &&
					this.linkFor(item)?.isFreezerStaple !== true
			)
		);
	}

	get linkPickerLink(): RecipeLink | null {
		return this.linkPickerItem ? this.linkFor(this.linkPickerItem) : null;
	}

	get linkPickerRelationship() {
		return this.linkPickerItem
			? recipeRelationshipKind(this.linkPickerItem, this.linkPickerLink)
			: ('unresolved' as const);
	}

	mount(): () => void {
		const handleShortcut = (event: KeyboardEvent) => {
			const target = event.target;
			const isTyping =
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target instanceof HTMLSelectElement ||
				(target instanceof HTMLElement && target.isContentEditable);
			if (event.key === '/' && !isTyping) {
				event.preventDefault();
				this.searchInput?.focus();
			}
		};
		window.addEventListener('keydown', handleShortcut);

		void (async () => {
			const raw = new URL(window.location.href).searchParams.get('item');
			const id = raw ? Number(raw) : NaN;
			const item = Number.isInteger(id)
				? this.items.find((candidate) => candidate.id === id)
				: undefined;
			if (!item) return;
			this.revealItem(item);
			this.openEdit(item);
			await tick();
			document.getElementById(`inventory-item-${id}`)?.scrollIntoView({
				behavior: 'smooth',
				block: 'center'
			});
		})();

		return () => window.removeEventListener('keydown', handleShortcut);
	}

	shelfLabel(kind: string): string {
		if (kind === 'leftover') return m.inventory_shelf_meals();
		if (kind === 'ingredient') return m.inventory_shelf_ingredients();
		if (kind === 'processed') return m.inventory_shelf_ready_made();
		return m.inventory_shelf_unsorted();
	}

	private bucket(item: Item): Kind | null {
		return item.kind === 'leftover' || item.kind === 'ingredient' || item.kind === 'processed'
			? item.kind
			: null;
	}

	private applyServer(local: Item, server: Record<string, unknown>): void {
		for (const field of SYNC_FIELDS) {
			if (field in server) (local as Record<string, unknown>)[field] = server[field];
		}
	}

	private reconcileItem(server: Item & { deletedAt?: unknown }): void {
		if (server.deletedAt) {
			this.items = this.items.filter((item) => item.id !== server.id);
			return;
		}
		const local = this.items.find((item) => item.id === server.id);
		if (local) this.applyServer(local, server as unknown as Record<string, unknown>);
		else this.items = [...this.items, { ...server }];
	}

	private async requestPatch(
		item: Item,
		payload: Record<string, unknown>
	): Promise<Item | null> {
		try {
			const response = await this.dependencies.fetch(`${base}/api/inventory/${item.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!response.ok) return null;
			const { item: updated } = await response.json();
			return updated as Item;
		} catch {
			return null;
		}
	}

	private async patch(item: Item, payload: Record<string, unknown>): Promise<boolean> {
		const updated = await this.requestPatch(item, payload);
		if (!updated) return false;
		try {
			const local = this.items.find((candidate) => candidate.id === item.id);
			if (local) this.applyServer(local, updated as unknown as Record<string, unknown>);
			return true;
		} catch {
			return false;
		}
	}

	flashToast(
		message: string,
		options?: { error?: boolean; action?: ToastAction }
	): void {
		this.dependencies.showToast(message, {
			variant: options?.error ? 'error' : 'success',
			action: options?.action
		});
	}

	linkFor(item: Item): RecipeLink | null {
		return item.madeFromRecipeId
			? (this.data.recipeLinks[item.madeFromRecipeId] ?? null)
			: null;
	}

	private onReachedZero(item: Item): void {
		if (item.kind === 'leftover' && this.linkFor(item)?.isFreezerStaple) {
			this.flashToast(m.inventory_toast_out_cook_again({ name: item.name }));
			return;
		}
		const action = item.isStaple
			? { label: m.inventory_action_add_to_list(), run: () => this.stapleOut(item) }
			: { label: m.inventory_action_remove(), run: () => this.deleteItem(item) };
		this.flashToast(m.inventory_toast_out({ name: item.name }), { action });
	}

	stepQty(item: Item, delta: number): Promise<void> {
		const previous = item.qtyNum ?? 0;
		const next = Math.max(0, Math.round((previous + delta) * 100) / 100);
		if (next === previous) return Promise.resolve();
		item.qtyNum = next;

		let sync = this.qtySyncByItem.get(item.id);
		if (!sync) {
			sync = { confirmed: previous, running: null };
			this.qtySyncByItem.set(item.id, sync);
		}
		if (sync.running) return sync.running;

		sync.running = (async () => {
			while (true) {
				const desired = item.qtyNum ?? 0;
				const previouslyConfirmed = sync!.confirmed;
				const updated = await this.requestPatch(item, {
					qty_num: desired,
					qty_text: composeQty(desired, item.unit)
				});
				if (!updated) {
					item.qtyNum = sync!.confirmed;
					this.flashToast(m.inventory_toast_qty_update_failed(), { error: true });
					return;
				}

				sync!.confirmed = updated.qtyNum ?? desired;
				if ((item.qtyNum ?? 0) !== desired) continue;

				this.applyServer(item, updated as unknown as Record<string, unknown>);
				if (desired === 0 && previouslyConfirmed > 0) this.onReachedZero(item);
				return;
			}
		})().finally(() => {
			this.qtySyncByItem.delete(item.id);
		});
		return sync.running;
	}

	openQtyEdit(item: Item): void {
		this.qtyEditId = item.id;
		this.qtyEditVal = item.qtyNum !== null ? String(item.qtyNum) : '';
	}

	async commitQtyEdit(item: Item): Promise<void> {
		const id = item.id;
		this.qtyEditId = null;
		const quantity = parseFloat(this.qtyEditVal);
		if (!Number.isFinite(quantity) || quantity < 0) {
			if (this.qtyEditVal.trim() !== '') this.flashToast(m.inventory_toast_invalid_qty());
			return;
		}
		if (quantity === item.qtyNum) return;
		const previous = item.qtyNum;
		item.qtyNum = quantity;
		const ok = await this.patch(item, {
			qty_num: quantity,
			qty_text: composeQty(quantity, item.unit)
		});
		if (!ok) {
			const local = this.items.find((candidate) => candidate.id === id);
			if (local) local.qtyNum = previous;
			this.flashToast(m.inventory_toast_qty_update_failed(), { error: true });
		} else if (quantity === 0 && (previous ?? 0) > 0) {
			this.onReachedZero(item);
		}
	}

	async resolveReview(item: Item): Promise<void> {
		const previousFlag = item.needsReview;
		const previousReason = item.reviewReason;
		const previousReviewOnly = this.reviewOnly;
		item.needsReview = false;
		item.reviewReason = null;
		if (this.reviewOnly && this.items.every((candidate) => !candidate.needsReview)) {
			this.reviewOnly = false;
		}
		const ok = await this.patch(item, { needs_review: false });
		if (!ok) {
			item.needsReview = previousFlag;
			item.reviewReason = previousReason;
			this.reviewOnly = previousReviewOnly;
			this.flashToast(m.inventory_toast_resolve_failed(), { error: true });
		}
	}

	private async setRecipeStatus(
		item: Item,
		status: 'plan_to_add' | 'no_recipe'
	): Promise<boolean> {
		const ok = await this.patch(item, {
			made_from_recipe_id: null,
			recipe_status: status
		});
		if (!ok) {
			this.flashToast(m.inventory_toast_update_failed(), { error: true });
			return false;
		}
		await this.dependencies.invalidate();
		return true;
	}

	private async linkRecipe(
		item: Item,
		suggestion: { id: number; slug: string; title: string }
	): Promise<void> {
		const ok = await this.patch(item, {
			made_from_recipe_id: suggestion.id,
			recipe_status: 'linked'
		});
		if (!ok) {
			this.flashToast(m.inventory_toast_link_failed(), { error: true });
			return;
		}
		this.flashToast(m.inventory_toast_linked({ title: suggestion.title }));
		await this.dependencies.invalidate();
	}

	private async clearRecipeStatus(item: Item): Promise<boolean> {
		const ok = await this.patch(item, { recipe_status: null });
		if (!ok) {
			this.flashToast(m.inventory_toast_update_failed(), { error: true });
			return false;
		}
		await this.dependencies.invalidate();
		return true;
	}

	private async clearRecipeLink(item: Item): Promise<boolean> {
		const ok = await this.patch(item, {
			made_from_recipe_id: null,
			recipe_status: null
		});
		if (!ok) {
			this.flashToast(m.inventory_toast_update_failed(), { error: true });
			return false;
		}
		await this.dependencies.invalidate();
		return true;
	}

	openLinkPicker(item: Item): void {
		this.linkPickerItem = item;
		this.linkSearch = '';
		this.linkPickerOpen = true;
	}

	async pickLinkRecipe(option: { id: number; slug: string; title: string }): Promise<void> {
		const item = this.linkPickerItem;
		this.linkPickerOpen = false;
		if (item) await this.linkRecipe(item, option);
	}

	async setPickerRecipeStatus(status: 'plan_to_add' | 'no_recipe'): Promise<boolean> {
		return this.linkPickerItem ? this.setRecipeStatus(this.linkPickerItem, status) : false;
	}

	async clearPickerRecipeChoice(): Promise<boolean> {
		if (!this.linkPickerItem) return false;
		return this.linkPickerItem.madeFromRecipeId !== null
			? this.clearRecipeLink(this.linkPickerItem)
			: this.clearRecipeStatus(this.linkPickerItem);
	}

	openPortionEdit(item: Item): void {
		this.portionEditId = item.id;
		this.portionEditVal =
			item.qtyNum !== null ? String(Math.max(1, Math.round(item.qtyNum))) : '1';
	}

	async commitPortionEdit(item: Item): Promise<void> {
		const quantity = parseInt(this.portionEditVal, 10);
		this.portionEditId = null;
		if (!Number.isFinite(quantity) || quantity < 0) {
			if (this.portionEditVal.trim() !== '') {
				this.flashToast(m.inventory_toast_invalid_number());
			}
			return;
		}
		const ok = await this.patch(item, {
			unit: 'portion',
			qty_num: quantity,
			qty_text: composeQty(quantity, 'portion')
		});
		if (!ok) this.flashToast(m.inventory_toast_set_portions_failed(), { error: true });
	}

	async stapleOut(item: Item): Promise<void> {
		this.stapleOutBusy = item.id;
		try {
			const response = await this.dependencies.fetch(`${base}/api/shopping`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'add_source_manual',
					weekStart: this.data.currentWeekStart,
					name: item.name,
					amount: null,
					unit: null
				})
			});
			if (response.ok) {
				if (!this.stapleAdded.includes(item.id)) {
					this.stapleAdded = [...this.stapleAdded, item.id];
				}
				this.flashToast(m.inventory_toast_added_to_shopping({ name: item.name }));
			} else {
				this.flashToast(m.inventory_toast_add_shopping_failed(), { error: true });
			}
		} catch {
			this.flashToast(m.inventory_toast_add_shopping_failed(), { error: true });
		} finally {
			this.stapleOutBusy = null;
		}
	}

	openEdit(item: Item): void {
		if (this.editingId === item.id && this.editSheetOpen) {
			this.editSheetOpen = false;
			this.editingId = null;
			return;
		}
		this.editingId = item.id;
		this.editSheetOpen = true;
		this.qtyEditId = null;
		const link = this.linkFor(item);
		this.editDraft = {
			name: item.name,
			qty: item.qtyNum,
			unit: item.unit ?? '',
			kind: (item.kind ?? '') as Kind | '',
			section: item.section,
			foodClass: item.foodClass ?? '',
			expiry: item.expiryDate ?? '',
			staple: item.isStaple,
			keepStocked: link?.isFreezerStaple ?? false,
			target: link?.targetPortions ?? null
		};
		void this.loadItemHistory(item.id);
	}

	private async saveKeepStocked(item: Item): Promise<boolean> {
		const link = this.linkFor(item);
		if (!link || item.kind !== 'leftover') return true;
		const target =
			this.editDraft.target !== null
				? Math.max(1, Math.round(this.editDraft.target))
				: null;
		const changed =
			this.editDraft.keepStocked !== link.isFreezerStaple ||
			(this.editDraft.keepStocked &&
				target !== null &&
				target !== link.targetPortions);
		if (!changed) return true;
		if (
			!(await this.dependencies.patchKeepStocked(
				link.slug,
				this.editDraft.keepStocked,
				target
			))
		) {
			return false;
		}
		await this.dependencies.invalidate();
		return true;
	}

	async saveEdit(item: Item): Promise<void> {
		const payload: Record<string, unknown> = {};
		if (this.editDraft.name.trim() && this.editDraft.name.trim() !== item.name) {
			payload.name = this.editDraft.name.trim();
		}
		if (this.editDraft.qty !== item.qtyNum) {
			payload.qty_num = this.editDraft.qty;
			payload.qty_text =
				this.editDraft.qty !== null
					? composeQty(this.editDraft.qty, this.editDraft.unit || item.unit)
					: null;
		}
		if ((this.editDraft.unit || null) !== (item.unit ?? null)) {
			payload.unit = this.editDraft.unit || null;
		}
		if ((this.editDraft.kind || null) !== (item.kind ?? null)) {
			payload.kind = this.editDraft.kind || null;
		}
		if (this.editDraft.section !== item.section) payload.section = this.editDraft.section;
		if ((this.editDraft.foodClass || null) !== (item.foodClass ?? null)) {
			payload.food_class = this.editDraft.foodClass || null;
		}
		if ((this.editDraft.expiry || null) !== (item.expiryDate ?? null)) {
			payload.expiry_date = this.editDraft.expiry || null;
		}
		if (this.editDraft.staple !== item.isStaple) {
			payload.is_staple = this.editDraft.staple;
		}

		this.editSaving = true;
		const hadChanges = Object.keys(payload).length > 0;
		const itemSaved = hadChanges ? await this.patch(item, payload) : true;
		const stapleSaved = itemSaved ? await this.saveKeepStocked(item) : true;
		this.editSaving = false;
		if (itemSaved && stapleSaved) {
			this.editSheetOpen = false;
			this.editingId = null;
			if (hadChanges) this.flashToast(m.inventory_toast_saved_changes());
		} else {
			this.flashToast(m.inventory_toast_save_changes_failed(), { error: true });
		}
	}

	async deleteItem(item: Item): Promise<void> {
		if (this.editingId === item.id) {
			this.editSheetOpen = false;
			this.editingId = null;
		}
		const removal = captureRemoval(this.items, item.id);
		if (!removal.removed) return;
		this.items = removal.items;
		let ok = false;
		try {
			ok = (
				await this.dependencies.fetch(`${base}/api/inventory/${item.id}`, {
					method: 'DELETE'
				})
			).ok;
		} catch {
			ok = false;
		}
		if (!ok) {
			this.items = restoreRemoval(this.items, removal.removed);
			this.flashToast(m.inventory_toast_remove_failed(), { error: true });
			return;
		}
		this.flashToast(m.inventory_toast_removed({ name: item.name }), {
			action: {
				label: m.inventory_action_undo(),
				run: () => this.undoDelete(removal.removed!)
			}
		});
	}

	private async readServerItem(
		itemId: number
	): Promise<(Item & { deletedAt?: unknown }) | null | undefined> {
		try {
			const response = await this.dependencies.fetch(`${base}/api/inventory/${itemId}`);
			if (!response.ok) return response.status === 404 ? null : undefined;
			return (await response.json()).item as Item & { deletedAt?: unknown };
		} catch {
			return undefined;
		}
	}

	private removeOptimisticRestore(itemId: number): void {
		this.items = this.items.filter((item) => item.id !== itemId);
	}

	private async reconcileUndoFailure(removed: RemovedListItem<Item>): Promise<boolean> {
		const serverItem = await this.readServerItem(removed.item.id);
		if (serverItem === undefined) return false;
		if (serverItem === null || serverItem.deletedAt) {
			this.removeOptimisticRestore(removed.item.id);
		} else {
			this.reconcileItem(serverItem);
		}
		return true;
	}

	async undoDelete(removed: RemovedListItem<Item>): Promise<void> {
		this.dependencies.dismissToast();
		this.items = restoreRemoval(this.items, removed);
		try {
			const response = await this.dependencies.fetch(`${base}/api/inventory/undo`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ item_id: removed.item.id })
			});
			if (!response.ok) {
				await this.reconcileUndoFailure(removed);
				this.flashToast(
					response.status === 409
						? m.inventory_toast_undo_conflict()
						: m.inventory_toast_undo_failed(),
					{ error: response.status !== 409 }
				);
				return;
			}
			const { item } = await response.json();
			this.reconcileItem(item);
		} catch {
			const reconciled = await this.reconcileUndoFailure(removed);
			if (!reconciled) await this.dependencies.invalidate();
			this.flashToast(m.inventory_toast_undo_failed(), { error: true });
		}
	}

	async loadItemHistory(itemId: number): Promise<void> {
		try {
			const response = await this.dependencies.fetch(
				`${base}/api/inventory/history?item_id=${itemId}&limit=8`
			);
			if (!response.ok) return;
			const { events } = await response.json();
			this.historyByItem = { ...this.historyByItem, [itemId]: events };
		} catch {
			// History is a non-fatal read affordance.
		}
	}

	async openActivity(): Promise<void> {
		this.activityOpen = true;
		this.activityLoading = true;
		try {
			const response = await this.dependencies.fetch(
				`${base}/api/inventory/history?limit=50`
			);
			if (response.ok) this.activityEvents = (await response.json()).events;
			else this.flashToast(m.inventory_toast_activity_failed(), { error: true });
		} catch {
			this.flashToast(m.inventory_toast_activity_failed(), { error: true });
		} finally {
			this.activityLoading = false;
		}
	}

	async undoEvent(event: HistoryEvent): Promise<void> {
		try {
			const response = await this.dependencies.fetch(`${base}/api/inventory/undo`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ op_id: event.id })
			});
			if (response.status === 409) {
				if (event.itemId) {
					const local = this.items.find((item) => item.id === event.itemId);
					if (local) {
						local.needsReview = true;
						local.reviewReason = 'undo_conflict';
					}
				}
				this.flashToast(m.inventory_toast_undo_conflict());
			} else if (!response.ok) {
				this.flashToast(m.inventory_toast_undo_failed(), { error: true });
			} else {
				const { item } = await response.json();
				this.reconcileItem(item);
			}
			if (this.activityOpen) await this.openActivity();
			if (event.itemId && this.historyByItem[event.itemId]) {
				await this.loadItemHistory(event.itemId);
			}
		} catch {
			this.flashToast(m.inventory_toast_undo_failed(), { error: true });
		}
	}

	onItemAdded(
		item: Item & { deletedAt?: unknown },
		section: Section,
		name: string
	): void {
		this.reconcileItem(item);
		this.showAddForm = false;
		this.sectionFilter = section;
		this.classFilter = null;
		this.reviewOnly = false;
		this.relationshipReviewOnly = false;
		this.searchQuery = '';
		this.quickView = null;
		this.scope =
			item.kind === 'leftover'
				? 'meals'
				: item.kind === 'ingredient'
					? 'ingredients'
					: 'all';
		this.flashToast(m.inventory_toast_added({ name }));
	}

	clearFilters(): void {
		this.sectionFilter = 'all';
		this.classFilter = null;
		this.reviewOnly = false;
		this.relationshipReviewOnly = false;
		this.searchQuery = '';
		this.quickView = null;
	}

	revealItem(item: Item): void {
		this.clearFilters();
		this.scope = item.kind === 'leftover' ? 'meals' : 'all';
	}

	attentionText(attention: StockAttention): string {
		if (attention.kind === 'expiry') {
			if (attention.daysUntil < 0) {
				return m.inventory_attention_expired({ days: Math.abs(attention.daysUntil) });
			}
			if (attention.daysUntil === 0) return m.inventory_attention_today();
			if (attention.daysUntil === 1) return m.inventory_attention_tomorrow();
			return m.inventory_attention_expiry({ days: attention.daysUntil });
		}
		if (attention.kind === 'below_target') {
			return m.inventory_attention_below_target({ count: attention.portionsBelow });
		}
		if (attention.kind === 'low_stock') {
			return m.inventory_attention_low_stock({ count: attention.portions });
		}
		return m.inventory_attention_aging({ days: attention.daysOld });
	}

	scopeLabel(value: InventoryScope): string {
		if (value === 'meals') return m.inventory_scope_meals();
		if (value === 'ingredients') return m.inventory_scope_ingredients();
		return m.inventory_scope_all();
	}

	setScope(value: InventoryScope): void {
		if (value !== 'meals') this.quickView = null;
		if (value !== 'meals') this.relationshipReviewOnly = false;
		this.scope = value;
	}

	openRelationshipReview(): void {
		this.scope = 'meals';
		this.sectionFilter = 'all';
		this.classFilter = null;
		this.reviewOnly = false;
		this.quickView = null;
		this.searchQuery = '';
		this.relationshipReviewOnly = true;
	}

	closeRelationshipReview(): void {
		this.relationshipReviewOnly = false;
	}

	toggleQuickView(value: InventoryQuickView): void {
		this.quickView = this.quickView === value ? null : value;
		this.scope = 'meals';
	}

	quickViewStatus(): string {
		return this.quickView === 'ready'
			? m.inventory_quick_view_ready_status({ count: this.visibleMealResultCount })
			: m.inventory_quick_view_below_target_status({
					count: this.visibleMealResultCount
				});
	}

	clearSearch(): void {
		this.searchQuery = '';
		this.searchInput?.focus();
	}
}
