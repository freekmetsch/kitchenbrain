<!--
	Inventory — the "decide what to eat" stock page, rebuilt on the 3-facet model
	(Section · Kind · Food Class — ADR 0001). V2×V3 design hybrid: V2's legible
	kind-sectioned shelves + the −/+ stepper, V3's dense rows (aging accent bar,
	micro facet chips, in-place edit). Quantity is unit-aware: countable units get
	the ± stepper; measured units (g/kg/ml/l) get a tap-to-type field so you never
	tap "+100" five times. P2.2 facet filters/grouping + P2.3 history/review/undo.
	This file is the orchestrator — page-level state, server writes, and
	composition; the UI sections live in $lib/components/inventory/*.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { onMount, tick, untrack } from 'svelte';
	import { slide } from 'svelte/transition';
	import { MOTION_MICRO_MS } from '$lib/motion';
	import { m } from '$lib/paraglide/messages';
	import ActivitySheet from '$lib/components/inventory/ActivitySheet.svelte';
	import AddItemForm from '$lib/components/inventory/AddItemForm.svelte';
	import FacetBar from '$lib/components/inventory/FacetBar.svelte';
	import GhostRows from '$lib/components/inventory/GhostRows.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import ItemRow from '$lib/components/inventory/ItemRow.svelte';
	import LinkRecipeSheet from '$lib/components/inventory/LinkRecipeSheet.svelte';
	import { composeQty, daysOld } from '$lib/components/inventory/shared';
	import type {
		EditDraft,
		HistoryEvent,
		Item,
		Kind,
		Section
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

	// ── constants ──────────────────────────────────────────────────────────────
	const KIND_ORDER = ['leftover', 'ingredient', 'processed', null] as const;
	// Display-only rename (UX-STOCK-8): the DB kind slug stays `leftover`, but
	// these are intentionally batch-cooked freezer meals, not scraps.
	function shelfLabel(kind: string): string {
		if (kind === 'leftover') return m.inventory_shelf_meals();
		if (kind === 'ingredient') return m.inventory_shelf_ingredients();
		if (kind === 'processed') return m.inventory_shelf_ready_made();
		return m.inventory_shelf_unsorted();
	}
	function shelfHint(kind: string): string {
		return kind === 'null' ? m.inventory_shelf_hint_unsorted() : '';
	}

	// ── state ──────────────────────────────────────────────────────────────────
	let items = $state<Item[]>(untrack(() => data.items.map((i) => ({ ...i }))));

	let sectionFilter = $state<Section | 'all'>('all');
	let classFilter = $state<string | null>(null);
	let reviewOnly = $state(false);

	let showAddForm = $state(false);
	let editingId = $state<number | null>(null);
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

	const filtered = $derived(
		items.filter(
			(i) =>
				(sectionFilter === 'all' || i.section === sectionFilter) &&
				(classFilter === null || rollsUpTo(i.foodClass, classFilter)) &&
				(!reviewOnly || i.needsReview)
		)
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
				{ key: 'sectionFilter', value: sectionFilter },
				{ key: 'foodClassFilter', value: classFilter ?? 'all' },
				{ key: 'reviewOnly', value: reviewOnly }
			]
		})
	);

	function bucket(i: Item): Kind | null {
		return i.kind === 'leftover' || i.kind === 'ingredient' || i.kind === 'processed' ? i.kind : null;
	}

	// Ghost rows live in the Meals shelf and are freezer recipes, so they show
	// only when no filter excludes them (UX-STOCK-14).
	const ghostsVisible = $derived(
		(sectionFilter === 'all' || sectionFilter === 'freezer') && classFilter === null && !reviewOnly
			? data.stapleGhosts
			: []
	);

	const shelves = $derived(
		KIND_ORDER.map((kind) => ({
			kind,
			hint: shelfHint(String(kind)),
			label: shelfLabel(String(kind)),
			items: filtered
				.filter((i) => bucket(i) === kind)
				.sort((a, b) =>
					kind === 'leftover'
						? daysOld(b) - daysOld(a)
						: Number(b.needsReview) - Number(a.needsReview) || a.name.localeCompare(b.name, 'en')
				)
		})).filter((s) => s.items.length > 0 || (s.kind === 'leftover' && ghostsVisible.length > 0))
	);


	// Home's expiry alert deep-links to the exact row. Open its editor and bring
	// it into view instead of dropping the user at the top of a generic page.
	onMount(async () => {
		const raw = new URL(window.location.href).searchParams.get('item');
		const id = raw ? Number(raw) : NaN;
		const item = Number.isInteger(id) ? items.find((candidate) => candidate.id === id) : undefined;
		if (!item) return;
		clearFilters();
		openEdit(item);
		await tick();
		document.getElementById(`inventory-item-${id}`)?.scrollIntoView({
			behavior: 'smooth',
			block: 'center'
		});
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
	async function setRecipeStatus(item: Item, status: 'plan_to_add' | 'no_recipe') {
		const ok = await patch(item, { recipe_status: status });
		if (!ok) flashToast(m.inventory_toast_update_failed(), { error: true });
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
	async function clearRecipeStatus(item: Item) {
		const ok = await patch(item, { recipe_status: null });
		if (!ok) {
			flashToast(m.inventory_toast_update_failed(), { error: true });
			return;
		}
		await invalidateAll();
	}

	// ── manual link picker (UX-STOCK-2) ────────────────────────────────────────
	let linkPickerOpen = $state(false);
	let linkPickerItem = $state<Item | null>(null);
	let linkSearch = $state('');
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
					action: 'add_manual',
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
		if (editingId === item.id) {
			editingId = null;
			return;
		}
		editingId = item.id;
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
			editingId = null;
			if (hadChanges) flashToast(m.inventory_toast_saved_changes());
		} else flashToast(m.inventory_toast_save_changes_failed(), { error: true });
	}

	// ── delete + undo ──────────────────────────────────────────────────────────────
	async function deleteItem(item: Item) {
		if (editingId === item.id) editingId = null;
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
		flashToast(m.inventory_toast_added({ name }));
	}

	function clearFilters() {
		sectionFilter = 'all';
		classFilter = null;
		reviewOnly = false;
	}
</script>

<svelte:head><title>{m.inventory_title()}</title></svelte:head>

<!-- ── page ─────────────────────────────────────────────────────────────────────── -->
<div class="ui-page-shell">
	<!-- header -->
	<div class="flex items-center justify-between gap-3 px-4 pb-1 pt-4">
		<h1 class="min-w-0 text-2xl font-semibold leading-tight">{m.inventory_heading()}</h1>
		<div class="flex items-center gap-1.5">
			<button type="button" class="btn btn-ghost btn-sm h-9 w-9 p-0" aria-label={m.inventory_activity_aria()} onclick={openActivity}><Icon name="clock" class="h-4 w-4" /></button>
			<button type="button" class="btn btn-primary btn-sm h-9 gap-1.5 rounded-lg px-3.5" aria-expanded={showAddForm} onclick={() => (showAddForm = !showAddForm)}>
				<Icon name="plus" class="h-3.5 w-3.5" /> {m.inventory_add_button()}
			</button>
		</div>
	</div>

	<!-- sticky facet bar (P2.2) -->
	<FacetBar bind:sectionFilter bind:classFilter bind:reviewOnly {needsReviewCount} />

	<!-- add form -->
	<AddItemForm open={showAddForm} onCancel={() => (showAddForm = false)} onAdded={onItemAdded} {flashToast} />

	<!-- shelves -->
	<div class="px-4">
		{#each shelves as shelf (shelf.kind)}
			<section class="mt-5">
				<div class="mb-2 flex items-baseline justify-between px-1">
					<h2 class="ui-section-label">
						{shelf.label} <span class="ml-1 font-normal">{shelf.items.length}</span>
					</h2>
					{#if shelf.hint}<span class="text-xs text-base-content/55">{shelf.hint}</span>{/if}
				</div>
				<ul class="ui-list-card divide-y divide-base-200">
					{#each shelf.items as item (item.id)}
						<li id="inventory-item-{item.id}" class="relative overflow-hidden" transition:slide={{ duration: MOTION_MICRO_MS }}>
							<ItemRow
								{item}
								link={linkFor(item)}
								matches={data.recipeMatches[item.id] ?? []}
								suggestions={data.leftoverSuggestions[item.id] ?? []}
								editing={editingId === item.id}
								qtyEditing={qtyEditId === item.id}
								bind:qtyEditVal
								portionEditing={portionEditId === item.id}
								bind:portionEditVal
								history={historyByItem[item.id]}
								bind:draft={editDraft}
								saving={editSaving}
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
								onSetRecipeStatus={(status) => setRecipeStatus(item, status)}
								onLinkRecipe={(s) => linkRecipe(item, s)}
								onClearRecipeStatus={() => clearRecipeStatus(item)}
								onOpenLinkPicker={() => openLinkPicker(item)}
								onOpenPortionEdit={() => openPortionEdit(item)}
								onCommitPortionEdit={() => commitPortionEdit(item)}
								onCancelPortionEdit={() => (portionEditId = null)}
								onSaveEdit={() => saveEdit(item)}
								onCancelEdit={() => (editingId = null)}
								onUndoEvent={undoEvent}
							/>
						</li>
					{/each}
					{#if shelf.kind === 'leftover'}
						<!-- Ghost rows (UX-STOCK-14): keep-stocked recipes with no live row. -->
						<GhostRows ghosts={ghostsVisible} {flashToast} />
					{/if}
				</ul>
			</section>
		{/each}

		{#if filtered.length === 0}
			{#if items.length === 0}
				<EmptyState iconName="jar" title={m.inventory_empty_title()}>
					{#snippet action()}
						<button type="button" class="btn btn-primary btn-sm" onclick={() => (showAddForm = true)}>
							{m.inventory_empty_add_first_button()}
						</button>
					{/snippet}
				</EmptyState>
			{:else}
				<EmptyState title={m.inventory_empty_filtered_title()}>
					{#snippet action()}
						<button type="button" class="btn btn-ghost btn-sm h-8 min-h-0 text-primary" onclick={clearFilters}>{m.inventory_clear_filters_button()}</button>
					{/snippet}
				</EmptyState>
			{/if}
		{/if}
	</div>
</div>

<!-- ── link picker (UX-STOCK-2) ─────────────────────────────────────────────────── -->
<LinkRecipeSheet
	bind:open={linkPickerOpen}
	item={linkPickerItem}
	bind:search={linkSearch}
	options={data.recipeOptions}
	onPick={pickLinkRecipe}
/>

<!-- ── activity drawer (P2.3) ──────────────────────────────────────────────────────── -->
<ActivitySheet bind:open={activityOpen} loading={activityLoading} events={activityEvents} onUndo={undoEvent} />
