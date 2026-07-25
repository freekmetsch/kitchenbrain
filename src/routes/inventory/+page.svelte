<!--
	Inventory — a meals-first Stock Radar. The full-width olive outcome band and
	responsive Use next / Still plenty ledger are shared across breakpoints;
	quantity writes, recipe relationships, editing, review, history, undo, and
	ghost-row recovery remain owned by this orchestrator.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { onMount, tick, untrack } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import ActivitySheet from '$lib/components/inventory/ActivitySheet.svelte';
	import AddItemForm from '$lib/components/inventory/AddItemForm.svelte';
	import FiltersSheet from '$lib/components/inventory/FiltersSheet.svelte';
	import GhostRows from '$lib/components/inventory/GhostRows.svelte';
	import ItemEditor from '$lib/components/inventory/ItemEditor.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import ItemRow from '$lib/components/inventory/ItemRow.svelte';
	import LinkRecipeSheet from '$lib/components/inventory/LinkRecipeSheet.svelte';
	import RecipeRelationshipStatus from '$lib/components/inventory/RecipeRelationshipStatus.svelte';
	import {
		composeQty,
		groupMealStock,
		matchesInventoryScope,
		matchesInventoryQuery,
		recipeCoverage,
		recipeRelationshipKind
	} from '$lib/components/inventory/shared';
	import type {
		EditDraft,
		HistoryEvent,
		InventoryScope,
		Item,
		Kind,
		Section,
		StockAttention
	} from '$lib/components/inventory/shared';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import { rollsUpTo } from '$lib/food_class';
	import { patchKeepStocked } from '$lib/keep_stocked';
	import { captureRemoval, restoreRemoval, type RemovedListItem } from '$lib/inventory_undo';
	import { toast } from '$lib/stores/toast.svelte';
	import type { PageData } from './$types';
	import { useChatAgent } from '$lib/chat/agent_context';

	let { data }: { data: PageData } = $props();
	const chatAgent = useChatAgent();
	const SCOPES: InventoryScope[] = ['meals', 'ingredients', 'all'];

	// Display-only rename: the DB kind slug stays `leftover`, but these are
	// intentionally batch-cooked freezer meals, not scraps.
	function shelfLabel(kind: string): string {
		if (kind === 'leftover') return m.inventory_shelf_meals();
		if (kind === 'ingredient') return m.inventory_shelf_ingredients();
		if (kind === 'processed') return m.inventory_shelf_ready_made();
		return m.inventory_shelf_unsorted();
	}
	// ── state ──────────────────────────────────────────────────────────────────
	let items = $state<Item[]>(untrack(() => data.items.map((i) => ({ ...i }))));

	let scope = $state<InventoryScope>('meals');
	let sectionFilter = $state<Section | 'all'>('all');
	let classFilter = $state<string | null>(null);
	let reviewOnly = $state(false);
	let searchQuery = $state('');
	let filtersOpen = $state(false);
	let searchInput = $state<HTMLInputElement>();

	let showAddForm = $state(false);
	let editingId = $state<number | null>(null);
	let editSheetOpen = $state(false);
	let qtyEditId = $state<number | null>(null);
	let qtyEditVal = $state('');

	let activityOpen = $state(false);
	let activityLoading = $state(false);
	let activityEvents = $state<HistoryEvent[]>([]);
	let historyByItem = $state<Record<number, HistoryEvent[]>>({});

	// edit draft — the keep-stocked fields (UX-STOCK-14) patch the linked
	// RECIPE, not the item
	let editDraft = $state<EditDraft>({
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
	let editSaving = $state(false);

	// staples strip (P4.4)
	let stapleOutBusy = $state<number | null>(null);
	// ids added to this week's shopping list this session (P6.5 — confirmed state)
	let stapleAdded = $state<number[]>([]);

	// ── derived ────────────────────────────────────────────────────────────────
	const needsReviewCount = $derived(items.filter((i) => i.needsReview).length);
	const readyMealCount = $derived(
		items.filter((item) => item.kind === 'leftover' && (item.qtyNum ?? 0) > 0).length
	);
	const belowTargetItems = $derived(
		items.filter((item) => {
			if (item.kind !== 'leftover') return false;
			const link = linkFor(item);
			return (
				link?.isFreezerStaple === true &&
				link.targetPortions !== null &&
				(item.qtyNum ?? 0) < link.targetPortions
			);
		})
	);
	const hasActiveFilters = $derived(
		sectionFilter !== 'all' || classFilter !== null || reviewOnly
	);
	const filtered = $derived(
		items.filter(
			(i) =>
				(sectionFilter === 'all' || i.section === sectionFilter) &&
				(classFilter === null || rollsUpTo(i.foodClass, classFilter)) &&
				(!reviewOnly || i.needsReview) &&
				matchesInventoryScope(i, scope) &&
				matchesInventoryQuery(searchQuery, [
					i.name,
					i.unit,
					i.section,
					i.kind,
					i.foodClass,
					linkFor(i)?.title,
					shelfLabel(String(bucket(i)))
				])
		)
	);
	const mealGroups = $derived(groupMealStock(filtered, linkFor, data.todayIso));
	const visibleMealItems = $derived(filtered.filter((item) => item.kind === 'leftover'));
	const visibleRecipeCoverage = $derived(recipeCoverage(visibleMealItems));
	const stockRows = $derived(
		[...filtered].sort(
			(a, b) => Number(b.needsReview) - Number(a.needsReview) || a.name.localeCompare(b.name)
		)
	);
	const alternateScopeMatch = $derived(
		items.some(
			(item) =>
				(sectionFilter === 'all' || item.section === sectionFilter) &&
				(classFilter === null || rollsUpTo(item.foodClass, classFilter)) &&
				(!reviewOnly || item.needsReview) &&
				!matchesInventoryScope(item, scope) &&
				matchesInventoryQuery(searchQuery, [
					item.name,
					item.unit,
					item.section,
					item.kind,
					item.foodClass,
					linkFor(item)?.title,
					shelfLabel(String(bucket(item)))
				])
		)
	);
	const editingItem = $derived(
		editingId === null ? null : (items.find((item) => item.id === editingId) ?? null)
	);

	$effect(() =>
		chatAgent.publishScreen({
			v: 1,
			routeId: '/inventory',
			label: m.inventory_heading(),
			entity: { kind: 'inventory' },
			facts: [
				{ key: 'totalItems', value: items.length },
				{ key: 'visibleItems', value: filtered.length },
				{ key: 'scope', value: scope },
				{ key: 'sectionFilter', value: sectionFilter },
				{ key: 'foodClassFilter', value: classFilter ?? 'all' },
				{ key: 'reviewOnly', value: reviewOnly },
				{ key: 'hasSearch', value: searchQuery.trim().length > 0 }
			]
		})
	);

	function bucket(i: Item): Kind | null {
		return i.kind === 'leftover' || i.kind === 'ingredient' || i.kind === 'processed' ? i.kind : null;
	}

	// Ghost rows live in Cook again and are freezer recipes, so they show
	// only when no filter excludes them (UX-STOCK-14).
	const ghostsVisible = $derived(
		scope === 'meals' &&
		(sectionFilter === 'all' || sectionFilter === 'freezer') &&
		classFilter === null &&
		!reviewOnly
			? data.stapleGhosts.filter((ghost) =>
					matchesInventoryQuery(searchQuery, [
						ghost.title,
						m.inventory_shelf_meals(),
						m.inventory_section_freezer()
					])
				)
			: []
	);
	const visibleMealResultCount = $derived(
		mealGroups.useNext.length +
			mealGroups.stillPlenty.length +
			mealGroups.cookAgain.length +
			ghostsVisible.length
	);
	const hasUngroupedMealStock = $derived(
		scope === 'meals' &&
			filtered.some(
				(item) =>
					item.kind === 'leftover' &&
					(item.qtyNum ?? 0) <= 0 &&
					linkFor(item)?.isFreezerStaple !== true
			)
	);

	// Home's expiry alert deep-links to the exact row. Open its editor and bring
	// it into view instead of dropping the user at the top of a generic page.
	onMount(() => {
		function handleShortcut(event: KeyboardEvent) {
			const target = event.target;
			const isTyping =
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target instanceof HTMLSelectElement ||
				(target instanceof HTMLElement && target.isContentEditable);
			if (event.key === '/' && !isTyping) {
				event.preventDefault();
				searchInput?.focus();
			}
		}
		window.addEventListener('keydown', handleShortcut);

		void (async () => {
			const raw = new URL(window.location.href).searchParams.get('item');
			const id = raw ? Number(raw) : NaN;
			const item = Number.isInteger(id) ? items.find((candidate) => candidate.id === id) : undefined;
			if (!item) return;
			revealItem(item);
			openEdit(item);
			await tick();
			document.getElementById(`inventory-item-${id}`)?.scrollIntoView({
				behavior: 'smooth',
				block: 'center'
			});
		})();

		return () => window.removeEventListener('keydown', handleShortcut);
	});

	// ── server sync ──────────────────────────────────────────────────────────────
	const SYNC_FIELDS = [
		'name', 'qtyText', 'qtyNum', 'unit', 'section', 'kind', 'foodClass',
		'madeFromRecipeId', 'recipeStatus', 'needsReview', 'reviewReason', 'isStaple', 'expiryDate'
	] as const;

	function applyServer(local: Item, server: Record<string, unknown>) {
		for (const f of SYNC_FIELDS) if (f in server) (local as Record<string, unknown>)[f] = server[f];
	}

	function reconcileItem(server: Item & { deletedAt?: unknown }) {
		if (server.deletedAt) {
			items = items.filter((i) => i.id !== server.id);
			return;
		}
		const local = items.find((i) => i.id === server.id);
		if (local) applyServer(local, server as unknown as Record<string, unknown>);
		else items = [...items, { ...server }];
	}

	async function requestPatch(item: Item, payload: Record<string, unknown>): Promise<Item | null> {
		try {
			const res = await fetch(`${base}/api/inventory/${item.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!res.ok) return null;
			const { item: updated } = await res.json();
			return updated as Item;
		} catch {
			return null;
		}
	}

	async function patch(item: Item, payload: Record<string, unknown>): Promise<boolean> {
		const updated = await requestPatch(item, payload);
		if (!updated) return false;
		try {
			const local = items.find((i) => i.id === item.id);
			if (local) applyServer(local, updated);
			return true;
		} catch {
			// Network/parse failure → treat as not-ok so callers run their rollback.
			return false;
		}
	}

	// `error` used to be inferred from `msg.startsWith('Could not')` — that broke
	// the moment messages became translated (a Dutch string never starts with
	// "Could not"), so the variant is now passed explicitly.
	function flashToast(
		msg: string,
		opts?: { error?: boolean; action?: { label: string; run: () => void } }
	) {
		toast.show(msg, { variant: opts?.error ? 'error' : 'success', action: opts?.action });
	}

	function linkFor(item: Item) {
		return item.madeFromRecipeId ? (data.recipeLinks[item.madeFromRecipeId] ?? null) : null;
	}

	// When an item drops to 0: a keep-stocked meal persists as the cook-again cue
	// (UX-STOCK-14 — no Remove offer, the row IS the restock signal); a pantry
	// staple goes on the shopping list; anything else offers one-tap Remove.
	function onReachedZero(item: Item) {
		if (item.kind === 'leftover' && linkFor(item)?.isFreezerStaple) {
			flashToast(m.inventory_toast_out_cook_again({ name: item.name }));
			return;
		}
		const action = item.isStaple
			? { label: m.inventory_action_add_to_list(), run: () => stapleOut(item) }
			: { label: m.inventory_action_remove(), run: () => deleteItem(item) };
		flashToast(m.inventory_toast_out({ name: item.name }), { action });
	}

	// ── quantity ──────────────────────────────────────────────────────────────────
	type QtySync = { confirmed: number; running: Promise<void> | null };
	const qtySyncByItem = new Map<number, QtySync>();

	function stepQty(item: Item, delta: number) {
		const prev = item.qtyNum ?? 0;
		const next = Math.max(0, Math.round((prev + delta) * 100) / 100);
		if (next === prev) return;
		item.qtyNum = next;

		let sync = qtySyncByItem.get(item.id);
		if (!sync) {
			sync = { confirmed: prev, running: null };
			qtySyncByItem.set(item.id, sync);
		}
		if (sync.running) return;

		sync.running = (async () => {
			while (true) {
				const desired = item.qtyNum ?? 0;
				const previouslyConfirmed = sync!.confirmed;
				const updated = await requestPatch(item, {
					qty_num: desired,
					qty_text: composeQty(desired, item.unit)
				});
				if (!updated) {
					item.qtyNum = sync!.confirmed;
					flashToast(m.inventory_toast_qty_update_failed(), { error: true });
					return;
				}

				sync!.confirmed = updated.qtyNum ?? desired;
				// A newer tap happened while this request was in flight. Preserve the
				// optimistic value and persist that next instead of applying stale data.
				if ((item.qtyNum ?? 0) !== desired) continue;

				applyServer(item, updated as unknown as Record<string, unknown>);
				if (desired === 0 && previouslyConfirmed > 0) onReachedZero(item);
				return;
			}
		})().finally(() => {
			qtySyncByItem.delete(item.id);
		});
	}

	function openQtyEdit(item: Item) {
		qtyEditId = item.id;
		qtyEditVal = item.qtyNum !== null ? String(item.qtyNum) : '';
	}

	async function commitQtyEdit(item: Item) {
		const id = item.id;
		qtyEditId = null;
		const n = parseFloat(qtyEditVal);
		if (!Number.isFinite(n) || n < 0) {
			if (qtyEditVal.trim() !== '') flashToast(m.inventory_toast_invalid_qty());
			return;
		}
		if (n === item.qtyNum) return;
		const prev = item.qtyNum;
		item.qtyNum = n;
		const ok = await patch(item, { qty_num: n, qty_text: composeQty(n, item.unit) });
		if (!ok) {
			const local = items.find((i) => i.id === id);
			if (local) local.qtyNum = prev;
			flashToast(m.inventory_toast_qty_update_failed(), { error: true });
		} else if (n === 0 && (prev ?? 0) > 0) {
			onReachedZero(item);
		}
	}

	// ── review ────────────────────────────────────────────────────────────────────
	async function resolveReview(item: Item) {
		const prevFlag = item.needsReview;
		const prevReason = item.reviewReason;
		const prevReviewOnly = reviewOnly;
		item.needsReview = false;
		item.reviewReason = null;
		if (reviewOnly && items.every((i) => !i.needsReview)) reviewOnly = false;
		const ok = await patch(item, { needs_review: false });
		if (!ok) {
			item.needsReview = prevFlag;
			item.reviewReason = prevReason;
			reviewOnly = prevReviewOnly;
			flashToast(m.inventory_toast_resolve_failed(), { error: true });
		}
	}

	// ── recipe status resolver (P4.2 G10) ─────────────────────────────────────────
	async function setRecipeStatus(
		item: Item,
		status: 'plan_to_add' | 'no_recipe'
	): Promise<boolean> {
		const ok = await patch(item, {
			made_from_recipe_id: null,
			recipe_status: status
		});
		if (!ok) {
			flashToast(m.inventory_toast_update_failed(), { error: true });
			return false;
		}
		await invalidateAll();
		return true;
	}

	// P6.1: link an unlinked leftover to a suggested recipe IN PLACE. The old UI
	// rendered suggestions as navigation links that never linked anything — tapping
	// just opened the recipe and the leftover stayed unlinked. `invalidateAll`
	// re-runs the loader so `data.recipeLinks` gains the new entry (title + target)
	// and the row flips from suggestions to the ↗ linked-recipe chip.
	async function linkRecipe(item: Item, suggestion: { id: number; slug: string; title: string }) {
		const ok = await patch(item, { made_from_recipe_id: suggestion.id, recipe_status: 'linked' });
		if (!ok) {
			flashToast(m.inventory_toast_link_failed(), { error: true });
			return;
		}
		flashToast(m.inventory_toast_linked({ title: suggestion.title }));
		await invalidateAll();
	}

	// P6.4 #3: reverse a plan-to-add / no-recipe dismissal so the link options come
	// back. Clearing the status re-opens name-match suggestions (recomputed server-
	// side), so re-run the loader.
	async function clearRecipeStatus(item: Item): Promise<boolean> {
		const ok = await patch(item, { recipe_status: null });
		if (!ok) {
			flashToast(m.inventory_toast_update_failed(), { error: true });
			return false;
		}
		await invalidateAll();
		return true;
	}

	async function clearRecipeLink(item: Item): Promise<boolean> {
		const ok = await patch(item, {
			made_from_recipe_id: null,
			recipe_status: null
		});
		if (!ok) {
			flashToast(m.inventory_toast_update_failed(), { error: true });
			return false;
		}
		await invalidateAll();
		return true;
	}

	// ── manual link picker (UX-STOCK-2) ────────────────────────────────────────
	let linkPickerOpen = $state(false);
	let linkPickerItem = $state<Item | null>(null);
	let linkSearch = $state('');
	const linkPickerLink = $derived(linkPickerItem ? linkFor(linkPickerItem) : null);
	const linkPickerRelationship = $derived(
		linkPickerItem
			? recipeRelationshipKind(linkPickerItem, linkPickerLink)
			: ('unresolved' as const)
	);
	function openLinkPicker(item: Item) {
		linkPickerItem = item;
		linkSearch = '';
		linkPickerOpen = true;
	}
	async function pickLinkRecipe(option: { id: number; slug: string; title: string }) {
		const item = linkPickerItem;
		linkPickerOpen = false;
		if (item) await linkRecipe(item, option);
	}
	async function setPickerRecipeStatus(
		status: 'plan_to_add' | 'no_recipe'
	): Promise<boolean> {
		return linkPickerItem ? setRecipeStatus(linkPickerItem, status) : false;
	}
	async function clearPickerRecipeChoice(): Promise<boolean> {
		if (!linkPickerItem) return false;
		return linkPickerItem.madeFromRecipeId !== null
			? clearRecipeLink(linkPickerItem)
			: clearRecipeStatus(linkPickerItem);
	}

	// ── review fix: set-portions editor (UX-STOCK-1) ───────────────────────────
	let portionEditId = $state<number | null>(null);
	let portionEditVal = $state('');
	function openPortionEdit(item: Item) {
		portionEditId = item.id;
		portionEditVal = item.qtyNum !== null ? String(Math.max(1, Math.round(item.qtyNum))) : '1';
	}
	async function commitPortionEdit(item: Item) {
		const n = parseInt(portionEditVal, 10);
		portionEditId = null;
		if (!Number.isFinite(n) || n < 0) {
			if (portionEditVal.trim() !== '') flashToast(m.inventory_toast_invalid_number());
			return;
		}
		// Writing unit=portion + an integer count clears the rule flag server-side.
		const ok = await patch(item, { unit: 'portion', qty_num: n, qty_text: composeQty(n, 'portion') });
		if (!ok) flashToast(m.inventory_toast_set_portions_failed(), { error: true });
	}

	// ── pantry staples → shopping push (P4.4) ─────────────────────────────────────
	async function stapleOut(item: Item) {
		stapleOutBusy = item.id;
		try {
			const res = await fetch(`${base}/api/shopping`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'add_source_manual',
					weekStart: data.currentWeekStart,
					name: item.name,
					amount: null,
					unit: null
				})
			});
			if (res.ok) {
				if (!stapleAdded.includes(item.id)) stapleAdded = [...stapleAdded, item.id];
				flashToast(m.inventory_toast_added_to_shopping({ name: item.name }));
			} else flashToast(m.inventory_toast_add_shopping_failed(), { error: true });
		} catch {
			flashToast(m.inventory_toast_add_shopping_failed(), { error: true });
		} finally {
			stapleOutBusy = null;
		}
	}

	// ── edit ────────────────────────────────────────────────────────────────────
	function openEdit(item: Item) {
		if (editingId === item.id && editSheetOpen) {
			editSheetOpen = false;
			editingId = null;
			return;
		}
		editingId = item.id;
		editSheetOpen = true;
		qtyEditId = null;
		const link = linkFor(item);
		editDraft = {
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
		loadItemHistory(item.id);
	}

	// The row editor's "Keep stocked" toggle is the same control as the recipe
	// page — it patches the recipe, and toggling off records the opt-out server-
	// side so the next freeze doesn't silently re-enable it (UX-STOCK-14).
	async function saveKeepStocked(item: Item): Promise<boolean> {
		const link = linkFor(item);
		if (!link || item.kind !== 'leftover') return true;
		const target = editDraft.target !== null ? Math.max(1, Math.round(editDraft.target)) : null;
		const changed =
			editDraft.keepStocked !== link.isFreezerStaple ||
			(editDraft.keepStocked && target !== null && target !== link.targetPortions);
		if (!changed) return true;
		if (!(await patchKeepStocked(link.slug, editDraft.keepStocked, target))) return false;
		await invalidateAll();
		return true;
	}

	async function saveEdit(item: Item) {
		const payload: Record<string, unknown> = {};
		if (editDraft.name.trim() && editDraft.name.trim() !== item.name) payload.name = editDraft.name.trim();
		if (editDraft.qty !== item.qtyNum) {
			payload.qty_num = editDraft.qty;
			payload.qty_text = editDraft.qty !== null ? composeQty(editDraft.qty, editDraft.unit || item.unit) : null;
		}
		if ((editDraft.unit || null) !== (item.unit ?? null)) payload.unit = editDraft.unit || null;
		if ((editDraft.kind || null) !== (item.kind ?? null)) payload.kind = editDraft.kind || null;
		if (editDraft.section !== item.section) payload.section = editDraft.section;
		if ((editDraft.foodClass || null) !== (item.foodClass ?? null)) payload.food_class = editDraft.foodClass || null;
		if ((editDraft.expiry || null) !== (item.expiryDate ?? null)) payload.expiry_date = editDraft.expiry || null;
		if (editDraft.staple !== item.isStaple) payload.is_staple = editDraft.staple;

		editSaving = true;
		const hadChanges = Object.keys(payload).length > 0;
		const okItem = hadChanges ? await patch(item, payload) : true;
		const okStaple = okItem ? await saveKeepStocked(item) : true;
		editSaving = false;
		if (okItem && okStaple) {
			editSheetOpen = false;
			editingId = null;
			if (hadChanges) flashToast(m.inventory_toast_saved_changes());
		} else flashToast(m.inventory_toast_save_changes_failed(), { error: true });
	}

	// ── delete + undo ──────────────────────────────────────────────────────────────
	async function deleteItem(item: Item) {
		if (editingId === item.id) {
			editSheetOpen = false;
			editingId = null;
		}
		const removal = captureRemoval(items, item.id);
		if (!removal.removed) return;
		items = removal.items;
		let ok = false;
		try {
			ok = (await fetch(`${base}/api/inventory/${item.id}`, { method: 'DELETE' })).ok;
		} catch {
			ok = false;
		}
		if (!ok) {
			items = restoreRemoval(items, removal.removed);
			flashToast(m.inventory_toast_remove_failed(), { error: true });
			return;
		}
		flashToast(m.inventory_toast_removed({ name: item.name }), {
			action: { label: m.inventory_action_undo(), run: () => undoDelete(removal.removed!) }
		});
	}

	async function readServerItem(itemId: number): Promise<(Item & { deletedAt?: unknown }) | null | undefined> {
		try {
			const res = await fetch(`${base}/api/inventory/${itemId}`);
			if (!res.ok) return res.status === 404 ? null : undefined;
			return (await res.json()).item as Item & { deletedAt?: unknown };
		} catch {
			return undefined;
		}
	}

	function removeOptimisticRestore(itemId: number) {
		items = items.filter((item) => item.id !== itemId);
	}

	async function reconcileUndoFailure(removed: RemovedListItem<Item>): Promise<boolean> {
		const serverItem = await readServerItem(removed.item.id);
		if (serverItem === undefined) return false;
		if (serverItem === null || serverItem.deletedAt) removeOptimisticRestore(removed.item.id);
		else reconcileItem(serverItem);
		return true;
	}

	async function undoDelete(removed: RemovedListItem<Item>) {
		toast.dismiss();
		items = restoreRemoval(items, removed);
		try {
			const res = await fetch(`${base}/api/inventory/undo`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ item_id: removed.item.id })
			});
			if (!res.ok) {
				await reconcileUndoFailure(removed);
				flashToast(
					res.status === 409 ? m.inventory_toast_undo_conflict() : m.inventory_toast_undo_failed(),
					{ error: res.status !== 409 }
				);
				return;
			}
			const { item } = await res.json();
			reconcileItem(item);
		} catch {
			const reconciled = await reconcileUndoFailure(removed);
			if (!reconciled) await invalidateAll();
			flashToast(m.inventory_toast_undo_failed(), { error: true });
		}
	}

	// ── history ────────────────────────────────────────────────────────────────────
	async function loadItemHistory(itemId: number) {
		try {
			const res = await fetch(`${base}/api/inventory/history?item_id=${itemId}&limit=8`);
			if (!res.ok) return;
			const { events } = await res.json();
			historyByItem = { ...historyByItem, [itemId]: events };
		} catch {
			/* non-fatal — history is a read affordance */
		}
	}

	async function openActivity() {
		activityOpen = true;
		activityLoading = true;
		try {
			const res = await fetch(`${base}/api/inventory/history?limit=50`);
			if (res.ok) activityEvents = (await res.json()).events;
		} finally {
			activityLoading = false;
		}
	}

	async function undoEvent(ev: HistoryEvent) {
		const res = await fetch(`${base}/api/inventory/undo`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ op_id: ev.id })
		});
		if (res.status === 409) {
			if (ev.itemId) {
				const local = items.find((i) => i.id === ev.itemId);
				if (local) {
					local.needsReview = true;
					local.reviewReason = 'undo_conflict';
				}
			}
			flashToast(m.inventory_toast_undo_conflict());
		} else if (!res.ok) {
			flashToast(m.inventory_toast_undo_failed(), { error: true });
		} else {
			const { item } = await res.json();
			reconcileItem(item);
		}
		if (activityOpen) await openActivity();
		if (ev.itemId && historyByItem[ev.itemId]) await loadItemHistory(ev.itemId);
	}

	// ── add ────────────────────────────────────────────────────────────────────────
	function onItemAdded(item: Item & { deletedAt?: unknown }, section: Section, name: string) {
		reconcileItem(item);
		showAddForm = false;
		// Show the new item: jump to its section and drop any filter that would
		// hide it (otherwise the add reads as "nothing happened" — P6.5 #4).
		sectionFilter = section;
		classFilter = null;
		reviewOnly = false;
		searchQuery = '';
		scope = item.kind === 'leftover' ? 'meals' : item.kind === 'ingredient' ? 'ingredients' : 'all';
		flashToast(m.inventory_toast_added({ name }));
	}

	function clearFilters() {
		sectionFilter = 'all';
		classFilter = null;
		reviewOnly = false;
		searchQuery = '';
	}

	function revealItem(item: Item) {
		clearFilters();
		scope = item.kind === 'leftover' ? 'meals' : 'all';
	}

	function attentionText(attention: StockAttention): string {
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

	function scopeLabel(value: InventoryScope): string {
		if (value === 'meals') return m.inventory_scope_meals();
		if (value === 'ingredients') return m.inventory_scope_ingredients();
		return m.inventory_scope_all();
	}

	function clearSearch() {
		searchQuery = '';
		searchInput?.focus();
	}
</script>

<svelte:head><title>{m.inventory_title()}</title></svelte:head>

{#snippet stockRow(item: Item, signalLabel: string | null)}
	<li
		id="inventory-item-{item.id}"
		class="relative overflow-hidden"
	>
		<ItemRow
			{item}
			link={linkFor(item)}
			matches={data.recipeMatches[item.id] ?? []}
			{signalLabel}
			qtyEditing={qtyEditId === item.id}
			bind:qtyEditVal
			portionEditing={portionEditId === item.id}
			bind:portionEditVal
			onOpenEdit={() => openEdit(item)}
			onDelete={() => deleteItem(item)}
			onStepQty={(delta) => stepQty(item, delta)}
			onOpenQtyEdit={() => openQtyEdit(item)}
			onCommitQtyEdit={() => commitQtyEdit(item)}
			onCancelQtyEdit={() => (qtyEditId = null)}
			onResolveReview={() => resolveReview(item)}
			stapleAdded={stapleAdded.includes(item.id)}
			stapleBusy={stapleOutBusy === item.id}
			onAddStaple={() => stapleOut(item)}
			onOpenLinkPicker={() => openLinkPicker(item)}
			onOpenPortionEdit={() => openPortionEdit(item)}
			onCommitPortionEdit={() => commitPortionEdit(item)}
			onCancelPortionEdit={() => (portionEditId = null)}
		/>
	</li>
{/snippet}

<!-- ── Responsive Radar Band ───────────────────────────────────────────────── -->
<div class="stock-radar pb-[calc(var(--ui-fixed-bar-height)+1.5rem)]">
	<header class="stock-band">
		<div class="stock-band-inner">
			<div class="stock-band-top">
				<div class="min-w-0">
					<p class="stock-context">{m.inventory_radar_context()}</p>
					<h1>{m.inventory_heading()}</h1>
				</div>
				<div class="flex shrink-0 items-center gap-1.5">
					<button
						type="button"
						class="stock-icon-button"
						aria-label={m.inventory_activity_aria()}
						onclick={openActivity}
					>
						<Icon name="clock" class="h-4 w-4" />
					</button>
					<button
						type="button"
						class="stock-add-button"
						aria-expanded={showAddForm}
						onclick={() => (showAddForm = true)}
					>
						<Icon name="plus" class="h-3.5 w-3.5" />
						{m.inventory_add_button()}
					</button>
				</div>
			</div>

			<div class="stock-stats" aria-label={m.inventory_heading()}>
				<div class="stock-stat">
					<strong>{readyMealCount}</strong>
					<span>{m.inventory_radar_meals_label()}</span>
				</div>
				<div class:attention={belowTargetItems.length > 0} class="stock-stat">
					<strong>{belowTargetItems.length}</strong>
					<span>{m.inventory_radar_below_target_label()}</span>
				</div>
			</div>
		</div>
	</header>

	<main class="stock-ledger">
		<div class="stock-tools">
			<label class="stock-search">
				<span class="sr-only">{m.inventory_search_label()}</span>
				<svg
					viewBox="0 0 16 16"
					class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-55"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					aria-hidden="true"
				>
					<path d="M11.25 11.25 14 14" />
					<circle cx="7.25" cy="7.25" r="5" />
				</svg>
				<input
					bind:this={searchInput}
					type="search"
					placeholder={m.inventory_search_placeholder()}
					bind:value={searchQuery}
					onkeydown={(event) => {
						if (event.key === 'Escape' && searchQuery) {
							event.preventDefault();
							clearSearch();
						}
					}}
				/>
				{#if searchQuery}
					<button
						type="button"
						aria-label={m.inventory_search_clear()}
						onclick={clearSearch}
					>
						<Icon name="x" class="h-3.5 w-3.5" />
					</button>
				{:else}
					<kbd>/</kbd>
				{/if}
			</label>

			<nav class="stock-scopes" aria-label={m.inventory_heading()}>
				{#each SCOPES as value (value)}
					<button
						type="button"
						aria-pressed={scope === value}
						class:active={scope === value}
						onclick={() => (scope = value)}
					>
						{scopeLabel(value)}
					</button>
				{/each}
				<button
					type="button"
					class:active={hasActiveFilters}
					aria-pressed={hasActiveFilters}
					onclick={() => (filtersOpen = true)}
				>
					{m.inventory_scope_filters()}
				</button>
			</nav>
		</div>

		{#if scope === 'meals' && visibleMealItems.length > 0}
			<div class="stock-coverage" aria-label={m.inventory_recipe_coverage_label()}>
				<strong>{m.inventory_recipe_coverage_label()}</strong>
				<RecipeRelationshipStatus
					relationship="linked"
					label={m.inventory_recipe_coverage_linked({ count: visibleRecipeCoverage.linked })}
				/>
				<RecipeRelationshipStatus
					relationship="planned"
					label={m.inventory_recipe_coverage_planned({ count: visibleRecipeCoverage.planned })}
				/>
				<RecipeRelationshipStatus
					relationship="not_needed"
					label={m.inventory_recipe_coverage_not_needed({ count: visibleRecipeCoverage.not_needed })}
				/>
				{#if visibleRecipeCoverage.unresolved > 0}
					<RecipeRelationshipStatus
						relationship="unresolved"
						label={m.inventory_recipe_coverage_unresolved({
							count: visibleRecipeCoverage.unresolved
						})}
					/>
				{/if}
			</div>
		{/if}

		{#if scope === 'meals' && visibleMealResultCount > 0}
			<div class="stock-columns">
				<section class="stock-group stock-attention">
					<div class="stock-group-head">
						<h2>{m.inventory_group_use_next()}</h2>
						<span>{m.inventory_group_use_next_hint()}</span>
					</div>
					{#if mealGroups.useNext.length > 0}
						<ul class="stock-list stock-priority divide-y">
							{#each mealGroups.useNext as entry (entry.item.id)}
								{@render stockRow(entry.item, attentionText(entry.attention))}
							{/each}
						</ul>
					{:else}
						<div class="stock-quiet">{m.inventory_group_caught_up()}</div>
					{/if}
				</section>

				<div class="stock-secondary-groups">
					{#if mealGroups.stillPlenty.length > 0}
						<section class="stock-group">
							<div class="stock-group-head">
								<h2>{m.inventory_group_still_plenty()}</h2>
								<span>{m.inventory_group_visible_count({ count: mealGroups.stillPlenty.length })}</span>
							</div>
							<ul class="stock-list divide-y">
								{#each mealGroups.stillPlenty as item (item.id)}
									{@render stockRow(item, null)}
								{/each}
							</ul>
						</section>
					{/if}

					{#if mealGroups.cookAgain.length > 0 || ghostsVisible.length > 0}
						<section class="stock-group">
							<div class="stock-group-head">
								<h2>{m.inventory_group_cook_again()}</h2>
								<span>{m.inventory_group_visible_count({
									count: mealGroups.cookAgain.length + ghostsVisible.length
								})}</span>
							</div>
							<ul class="stock-list stock-cook-again divide-y">
								{#each mealGroups.cookAgain as item (item.id)}
									{@render stockRow(item, m.inventory_group_cook_again())}
								{/each}
								<GhostRows ghosts={ghostsVisible} {flashToast} />
							</ul>
						</section>
					{/if}
				</div>
			</div>
		{:else if scope !== 'meals' && filtered.length > 0}
			<section class="stock-group stock-all">
				<div class="stock-group-head">
					<h2>{scopeLabel(scope)}</h2>
					<span>{m.inventory_group_visible_count({ count: stockRows.length })}</span>
				</div>
				<ul class="stock-list divide-y">
					{#each stockRows as item (item.id)}
						{@render stockRow(item, null)}
					{/each}
				</ul>
			</section>
		{:else}
			<div class="stock-empty">
				{#if items.length === 0}
					<EmptyState iconName="jar" title={m.inventory_empty_title()}>
						{#snippet action()}
							<button type="button" class="btn btn-primary min-h-11" onclick={() => (showAddForm = true)}>
								{m.inventory_empty_add_first_button()}
							</button>
						{/snippet}
					</EmptyState>
				{:else}
					<EmptyState title={m.inventory_empty_filtered_title()}>
						{#snippet action()}
							<div class="flex flex-wrap justify-center gap-2">
								{#if searchQuery}
									<button type="button" class="btn btn-ghost min-h-11" onclick={clearSearch}>
										{m.inventory_empty_clear_search()}
									</button>
								{/if}
								{#if alternateScopeMatch || hasUngroupedMealStock}
									<button type="button" class="btn btn-primary min-h-11" onclick={() => (scope = 'all')}>
										{m.inventory_empty_show_all()}
									</button>
								{:else}
									<button type="button" class="btn btn-primary min-h-11" onclick={clearFilters}>
										{m.inventory_clear_filters_button()}
									</button>
								{/if}
							</div>
						{/snippet}
					</EmptyState>
				{/if}
			</div>
		{/if}
	</main>
</div>

<FiltersSheet
	bind:open={filtersOpen}
	bind:sectionFilter
	bind:classFilter
	bind:reviewOnly
	{needsReviewCount}
/>

<BottomSheet bind:open={showAddForm} title={m.inventory_add_button()} desktopCentered>
	<AddItemForm
		open={showAddForm}
		onCancel={() => (showAddForm = false)}
		onAdded={onItemAdded}
		{flashToast}
	/>
</BottomSheet>

<BottomSheet
	bind:open={editSheetOpen}
	title={editingItem?.name ?? m.inventory_heading()}
	desktopCentered
	onclose={() => (editingId = null)}
>
	<ItemEditor
		editing={editSheetOpen && editingItem !== null}
		link={editingItem ? linkFor(editingItem) : null}
		matches={editingItem ? (data.recipeMatches[editingItem.id] ?? []) : []}
		history={editingItem ? historyByItem[editingItem.id] : undefined}
		bind:draft={editDraft}
		saving={editSaving}
		onDelete={() => {
			if (editingItem) void deleteItem(editingItem);
		}}
		onCancel={() => (editSheetOpen = false)}
		onSave={() => {
			if (editingItem) void saveEdit(editingItem);
		}}
		onUndoEvent={undoEvent}
	/>
</BottomSheet>

<!-- ── link picker (UX-STOCK-2) ─────────────────────────────────────────────────── -->
<LinkRecipeSheet
	bind:open={linkPickerOpen}
	item={linkPickerItem}
	link={linkPickerLink}
	relationship={linkPickerRelationship}
	bind:search={linkSearch}
	options={data.recipeOptions}
	onPick={pickLinkRecipe}
	onSetStatus={setPickerRecipeStatus}
	onClear={clearPickerRecipeChoice}
/>

<!-- ── activity drawer (P2.3) ──────────────────────────────────────────────────────── -->
<ActivitySheet bind:open={activityOpen} loading={activityLoading} events={activityEvents} onUndo={undoEvent} />

<style>
	.stock-radar {
		--stock-olive: #334638;
		--stock-olive-deep: #293b30;
		--stock-olive-soft: #49614f;
		--stock-honey: #d3a046;
		--stock-honey-ink: #69460f;
		--stock-terra: #a84d2a;
		--stock-paper: #f7f3e9;
		--stock-card: #fffdf7;
		min-height: 100%;
		background: var(--stock-paper);
		color: var(--color-base-content);
	}

	.stock-band {
		color: white;
		background: linear-gradient(135deg, var(--stock-olive-deep), var(--stock-olive-soft));
	}

	.stock-band-inner {
		max-width: 74rem;
		margin: 0 auto;
		padding: 1.35rem 1rem 1rem;
	}

	.stock-band-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.875rem;
	}

	.stock-context {
		color: #f0c569;
		font-size: 0.68rem;
		font-weight: 750;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}

	.stock-band h1,
	.stock-group-head h2 {
		font-family: Georgia, 'Times New Roman', serif;
	}

	.stock-band h1 {
		margin-top: 0.2rem;
		font-size: clamp(1.75rem, 6vw, 2.25rem);
		font-weight: 500;
		line-height: 1;
		letter-spacing: -0.035em;
	}

	.stock-icon-button,
	.stock-add-button {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: center;
		border: 1px solid rgb(255 255 255 / 24%);
		border-radius: 0.75rem;
		background: rgb(255 255 255 / 8%);
		color: white;
		transition:
			background var(--motion-micro) var(--ease-standard),
			border-color var(--motion-micro) var(--ease-standard);
	}

	.stock-icon-button {
		width: 2.75rem;
	}

	.stock-add-button {
		gap: 0.35rem;
		padding: 0 0.8rem;
		background: var(--stock-terra);
		border-color: transparent;
		font-size: 0.8rem;
		font-weight: 750;
	}

	.stock-icon-button:hover,
	.stock-icon-button:focus-visible {
		background: rgb(255 255 255 / 16%);
	}

	.stock-stats {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.stock-stat {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 0.55rem;
		min-height: 3.5rem;
		padding: 0.65rem 0.75rem;
		border: 1px solid rgb(255 255 255 / 21%);
		border-radius: 0.85rem;
		background: rgb(255 255 255 / 7%);
	}

	.stock-stat.attention {
		border-color: transparent;
		background: var(--stock-honey);
		color: #332613;
	}

	.stock-stat strong {
		font-size: 1.55rem;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	.stock-stat span {
		font-size: 0.7rem;
		font-weight: 650;
		line-height: 1.2;
	}

	.stock-ledger {
		max-width: 74rem;
		margin: 0 auto;
		padding: 0.9rem 0.875rem max(6.5rem, var(--ui-overlay-bottom));
	}

	.stock-tools {
		display: grid;
		gap: 0.55rem;
	}

	.stock-search {
		position: relative;
		display: block;
	}

	.stock-search input {
		width: 100%;
		height: 3rem;
		border: 1px solid color-mix(in oklab, var(--stock-olive) 24%, var(--color-base-300));
		border-radius: 0.8rem;
		background: var(--stock-card);
		padding: 0 2.9rem 0 2.55rem;
		box-shadow: 0 6px 18px rgb(51 70 56 / 7%);
		outline: none;
	}

	.stock-search input:focus {
		border-color: var(--stock-honey);
		box-shadow: 0 0 0 3px rgb(211 160 70 / 18%);
	}

	.stock-search button,
	.stock-search kbd {
		position: absolute;
		top: 50%;
		right: 0.3rem;
		display: inline-flex;
		height: 2.4rem;
		min-width: 2.4rem;
		transform: translateY(-50%);
		align-items: center;
		justify-content: center;
		border-radius: 0.6rem;
		color: color-mix(in oklab, var(--color-base-content) 62%, transparent);
	}

	.stock-search kbd {
		right: 0.7rem;
		width: auto;
		min-width: 0;
		font-size: 0.68rem;
	}

	.stock-scopes {
		display: flex;
		gap: 0.25rem;
		overflow-x: auto;
		padding: 0.2rem;
		border: 1px solid color-mix(in oklab, var(--stock-olive) 16%, var(--color-base-300));
		border-radius: 0.8rem;
		background: color-mix(in oklab, var(--stock-card) 88%, transparent);
		scrollbar-width: none;
	}

	.stock-scopes::-webkit-scrollbar {
		display: none;
	}

	.stock-scopes button {
		min-height: 2.6rem;
		flex: 0 0 auto;
		border-radius: 0.6rem;
		padding: 0 0.72rem;
		font-size: 0.76rem;
		font-weight: 700;
		white-space: nowrap;
		color: color-mix(in oklab, var(--color-base-content) 72%, transparent);
	}

	.stock-scopes button.active {
		background: var(--stock-olive);
		color: white;
		box-shadow: 0 3px 10px rgb(41 59 48 / 18%);
	}

	.stock-coverage {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.45rem 0.8rem;
		margin-top: 0.55rem;
		padding: 0.6rem 0.75rem;
		border-block: 1px solid color-mix(in oklab, var(--stock-olive) 14%, var(--color-base-300));
		font-size: 0.69rem;
		color: color-mix(in oklab, var(--color-base-content) 72%, transparent);
	}

	.stock-coverage strong {
		color: var(--color-base-content);
		font-size: 0.65rem;
		letter-spacing: 0.075em;
		text-transform: uppercase;
	}

	.stock-columns {
		display: grid;
		gap: 1rem;
		margin-top: 0.85rem;
	}

	.stock-secondary-groups {
		display: grid;
		align-content: start;
		gap: 1rem;
	}

	.stock-group-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.45rem;
		padding: 0 0.2rem;
	}

	.stock-group-head h2 {
		color: var(--stock-olive);
		font-size: 1.3rem;
		font-weight: 600;
		letter-spacing: -0.025em;
	}

	.stock-group-head span {
		color: color-mix(in oklab, var(--stock-terra) 72%, var(--color-base-content));
		font-size: 0.67rem;
		font-weight: 650;
	}

	.stock-list,
	.stock-quiet {
		--stock-row-bg: var(--stock-card);
		overflow: hidden;
		border: 1px solid color-mix(in oklab, var(--stock-olive) 18%, var(--color-base-300));
		border-radius: 0.85rem;
		background: var(--stock-card);
		box-shadow: 0 8px 20px rgb(51 70 56 / 5%);
	}

	.stock-priority {
		--stock-row-bg: color-mix(in oklab, var(--stock-honey) 13%, var(--stock-card));
		border-color: color-mix(in oklab, var(--stock-honey) 62%, var(--color-base-300));
		border-left-width: 0.3rem;
		background: color-mix(in oklab, var(--stock-honey) 13%, var(--stock-card));
	}

	.stock-cook-again {
		border-color: color-mix(in oklab, var(--stock-terra) 28%, var(--color-base-300));
	}

	.stock-quiet {
		padding: 1rem;
		color: color-mix(in oklab, var(--color-base-content) 68%, transparent);
		font-size: 0.78rem;
	}

	.stock-all,
	.stock-empty {
		margin-top: 0.9rem;
	}

	:global(html[data-theme='dark']) .stock-radar {
		--stock-paper: #1c221e;
		--stock-card: #252c27;
		--stock-honey-ink: #f0c569;
	}

	:global(html[data-theme='dark']) .stock-group-head h2 {
		color: #d8e4da;
	}

	@media (min-width: 48rem) {
		.stock-band-inner {
			padding-inline: 1.5rem;
		}

		.stock-ledger {
			padding-inline: 1.5rem;
		}

		.stock-tools {
			grid-template-columns: minmax(16rem, 1fr) auto;
			align-items: center;
		}
	}

	@media (min-width: 64rem) {
		.stock-band-inner {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 21rem;
			align-items: end;
			gap: 2rem;
			padding: 1.8rem 2rem;
		}

		.stock-band h1 {
			font-size: 2.5rem;
		}

		.stock-stats {
			margin-top: 0;
		}

		.stock-ledger {
			padding: 1.15rem 2rem max(6.5rem, var(--ui-overlay-bottom));
		}

		.stock-columns {
			grid-template-columns: minmax(18rem, 0.72fr) minmax(0, 1.65fr);
			gap: 1.15rem;
		}

		.stock-attention .stock-list :global(.btn) {
			padding-inline: 0.45rem;
		}
	}
</style>
