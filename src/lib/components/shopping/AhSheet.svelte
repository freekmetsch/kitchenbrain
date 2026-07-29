<!--
	The "Send to AH" bottom sheet — owns the whole AH client flow: preview
	fetch, per-item decisions (product pick / freetext / skip), favorites,
	per-item decisions and the final push. The page opens it via the exported
	`openAhModal()` and receives back only what it owns: bonus flags for the
	list rows (bindable) and the pushed-items-marked-bought callback.

	AH-INVARIANT: every term sent to the AH endpoints originates from Dutch
	shopping-list data — never from English display fields.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import KitchenNotice from '$lib/components/ui/KitchenNotice.svelte';
	import { optimistic } from '$lib/optimistic';
	import { m } from '$lib/paraglide/messages';
	import type { PreviewItem } from '$lib/shopping_ah';
	import { toast } from '$lib/stores/toast.svelte';
	import { fade } from 'svelte/transition';
	import AhPreviewItem from './AhPreviewItem.svelte';
	import AhPushResult from './AhPushResult.svelte';
	import { MOTION_MICRO_MS } from '$lib/motion';
	import type { AhPushOutcome, Decision, ShoppingListItem } from './types';

	type Props = {
		weekStart: string;
		/** Canonical unfiltered pending items; client filters and Store Route never narrow AH. */
		pending: ShoppingListItem[];
		/** Bonus status per item name, rendered on the page's list rows. */
		bonusByName: Record<string, boolean>;
		/** Called after a push so the page can mark the pushed items bought. */
		onMarkedBought: (refs: Set<string>) => void;
	};
	let { weekStart, pending, bonusByName = $bindable(), onMarkedBought }: Props = $props();

	let ahOpen = $state(false);
	let ahLoading = $state(false);
	let ahItems = $state<PreviewItem[] | null>(null);
	let decisions = $state<Record<string, Decision>>({});
	let expanded = $state<Record<string, boolean>>({});
	let previewToken = $state('');
	let ahError = $state('');
	let ahStale = $state(false);
	let ahNotConnected = $state(false);
	let ahPushing = $state(false);
	let ahResult = $state<AhPushOutcome | null>(null);
	let previewRun = 0;

	// Favorite AH product per item term (household-level, server-persisted).
	// Seeded from each preview's isFavorite flags; toggles update optimistically.
	let favorites = $state<Record<string, string>>({});

	// Shared reset for everything scoped to one preview run — the week-switch
	// effect and openAhModal must clear the same set, or a stale field leaks.
	function resetAhPreview() {
		previewRun += 1;
		ahItems = null;
		decisions = {};
		expanded = {};
		previewToken = '';
		favorites = {};
		ahError = '';
		ahStale = false;
		ahNotConnected = false;
		ahResult = null;
	}

	// The AH preview/decisions/bonus flags are all scoped to one week's items --
	// switching weeks must not leak a stale preview (wrong refs, wrong pricing)
	// into the new week. The BottomSheet is a native modal so this can only be
	// reached with the sheet already closed, but reset every field regardless.
	$effect(() => {
		const _ = weekStart;
		ahOpen = false;
		ahLoading = false;
		ahPushing = false;
		bonusByName = {};
		resetAhPreview();
	});

	let pushSummary = $derived.by(() => {
		let products = 0;
		let text = 0;
		let excluded = 0;
		let unconfirmed = 0;
		let unresolved = 0;
		for (const it of ahItems ?? []) {
			const d = decisions[it.ref];
			if (!d) {
				if (it.requiresExplicitDecision) unresolved++;
				else excluded++;
			}
			else if (d.mode === 'exclude') excluded++;
			else if (d.mode === 'product' && it.candidates[d.pick]) {
				products++;
				if (it.incompatibleQuantities && !d.quantityConfirmed) unconfirmed++;
			}
			else text++;
		}
		return { products, text, excluded, unconfirmed, unresolved };
	});

	export async function openAhModal() {
		const weekAtOpen = weekStart;
		resetAhPreview();
		const run = ++previewRun;
		ahLoading = true;
		ahOpen = true;
		const stale = () => weekStart !== weekAtOpen || previewRun !== run;

		// AH-INVARIANT: item names originate from Dutch shopping-list data.
		// Exclude items already covered by stock -- sending them would over-buy.
		const entryIds = pending
			.filter((i) => !i.covered)
			.flatMap((i) => i.entryIds ?? []);
		if (!entryIds.length) {
			ahLoading = false;
			ahError = m.shopping_ah_error_no_pending();
			return;
		}

		try {
			const r = await fetch(`${base}/api/shopping/ah-preview`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekStart: weekAtOpen, entryIds })
			});
			// The user may have switched weeks or started another preview while
			// this request was in flight. A stale response must not write into it.
			if (stale()) return;
			if (!r.ok) {
				ahError = m.shopping_ah_error_connection_failed();
				toast.error(m.shopping_toast_ah_matches_failed());
				return;
			}
			const d = await r.json();
			if (stale()) return;
			if (!d.ok) {
				if (d.reason === 'not_connected') ahNotConnected = true;
				else ahError = d.reason ?? m.shopping_ah_error_connection_failed();
				return;
			}

			const previewItems = Array.isArray(d.items) ? (d.items as PreviewItem[]) : null;
			if (!previewItems || typeof d.previewToken !== 'string') throw new Error('Invalid AH preview response');
			previewToken = d.previewToken;
			const nextDecisions: Record<string, Decision> = {};
			const nextBonus: Record<string, boolean> = {};
			const nextFavorites: Record<string, string> = {};
			for (const it of previewItems) {
				if (!it.requiresExplicitDecision) {
					nextDecisions[it.ref] = {
						mode: it.status === 'product' ? 'product' : 'freetext',
						pick: 0,
						qty: it.candidates[0]?.qty ?? 1,
						quantityConfirmed: !it.incompatibleQuantities
					};
				}
				if (it.status === 'product') nextBonus[it.sourceName] = it.candidates[0]?.isBonus ?? false;
				const fav = it.candidates.find((c) => c.isFavorite);
				if (fav) nextFavorites[it.term] = fav.id;
			}
			decisions = nextDecisions;
			favorites = nextFavorites;
			bonusByName = { ...bonusByName, ...nextBonus };
			ahItems = previewItems;
		} catch {
			if (stale()) return;
			ahError = m.shopping_ah_error_connection_failed();
			toast.error(m.shopping_toast_ah_matches_failed());
		} finally {
			if (!stale()) ahLoading = false;
		}
	}

	function pickProduct(ref: string, idx: number) {
		const item = ahItems?.find((entry) => entry.ref === ref);
		decisions = {
			...decisions,
			[ref]: {
				mode: 'product',
				pick: idx,
				qty: item?.candidates[idx]?.qty ?? 1,
				quantityConfirmed: !item?.incompatibleQuantities
			}
		};
		expanded = { ...expanded, [ref]: false };
	}

	function setQuantity(ref: string, qty: number) {
		const current = decisions[ref];
		if (!current) return;
		const safe = Number.isFinite(qty) ? Math.max(1, Math.min(99, Math.round(qty))) : current.qty;
		decisions = { ...decisions, [ref]: { ...current, qty: safe, quantityConfirmed: true } };
	}

	function confirmQuantity(ref: string) {
		const current = decisions[ref];
		if (!current) return;
		decisions = { ...decisions, [ref]: { ...current, quantityConfirmed: true } };
	}

	/**
	 * Star = "this product is what this ingredient means in our house." One
	 * favorite per item name, server-persisted; future previews pin it on top.
	 * Starring also selects the product for this push; unstarring only unpins.
	 */
	async function toggleFavorite(item: PreviewItem, cand: PreviewItem['candidates'][number], idx: number) {
		const wasFavorite = favorites[item.term] === cand.id;
		const before = { ...favorites };
		if (wasFavorite) {
			const { [item.term]: _, ...rest } = favorites;
			favorites = rest;
		} else {
			favorites = { ...favorites, [item.term]: cand.id };
			decisions = {
				...decisions,
				[item.ref]: {
					mode: 'product',
					pick: idx,
					qty: cand.qty ?? 1,
					quantityConfirmed: !item.incompatibleQuantities
				}
			};
		}
		await optimistic(
			() =>
				wasFavorite
					? fetch(`${base}/api/shopping/ah-favorite?name=${encodeURIComponent(item.term)}`, { method: 'DELETE' })
					: fetch(`${base}/api/shopping/ah-favorite`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ name: item.term, productId: cand.id, productName: cand.name })
						}),
			() => {
				favorites = before;
			},
			m.shopping_toast_favorite_failed()
		);
	}

	function demoteToText(ref: string) {
		decisions = { ...decisions, [ref]: { mode: 'freetext', pick: 0, qty: 1, quantityConfirmed: true } };
		expanded = { ...expanded, [ref]: false };
	}

	function toggleExclude(ref: string, item: PreviewItem) {
		const cur = decisions[ref];
		if (item.requiresExplicitDecision && cur?.mode === 'exclude') {
			const { [ref]: _removed, ...remaining } = decisions;
			decisions = remaining;
			return;
		}
		const back: Decision =
			item.status === 'product'
				? {
						mode: 'product',
						pick: cur?.pick ?? 0,
						qty: cur?.qty ?? 1,
						quantityConfirmed: cur?.quantityConfirmed ?? !item.incompatibleQuantities
					}
				: { mode: 'freetext', pick: 0, qty: 1, quantityConfirmed: true };
		decisions = {
			...decisions,
			[ref]: cur?.mode === 'exclude'
				? back
				: { mode: 'exclude', pick: cur?.pick ?? 0, qty: cur?.qty ?? 1, quantityConfirmed: true }
		};
	}

	async function confirmPush() {
		if (!ahItems || !previewToken) return;
		if (pushSummary.unresolved > 0) {
			ahError = m.shopping_ah_preference_resolution_required();
			return;
		}
		const pushDecisions = ahItems.map((item) => {
			const decision = decisions[item.ref];
			const product = decision?.mode === 'product' ? item.candidates[decision.pick] : null;
			return decision?.mode === 'product' && product
				? {
						ref: item.ref,
						mode: 'product' as const,
						productId: product.id,
						qty: decision.qty,
						quantityConfirmed: decision.quantityConfirmed
					}
				: { ref: item.ref, mode: decision?.mode === 'freetext' ? 'freetext' as const : 'exclude' as const };
		});
		if (pushDecisions.every((decision) => decision.mode === 'exclude')) {
			ahError = m.shopping_ah_error_all_skipped();
			return;
		}

		const weekAtPush = weekStart;
		ahPushing = true;
		ahError = '';
		ahStale = false;
		try {
			const r = await fetch(`${base}/api/shopping/ah-push`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ previewToken, decisions: pushDecisions })
			});
			// The push may already have landed server-side. Ignore the response
			// after a week switch so the wrong week's rows are never reconciled.
			if (weekStart !== weekAtPush) return;
			if (r.status === 409) {
				ahStale = true;
				ahItems = null;
				return;
			}
			if (!r.ok) {
				// An unexpected HTTP failure does not prove the AH write failed.
				// Do not offer a retry that could duplicate external items.
				ahResult = {
					pushed: 0,
					accountName: null,
					destination: 'list',
					failed: [],
					markedBought: 0,
					uncertain: true,
					reason: m.shopping_ah_error_push_failed()
				};
				ahItems = null;
				return;
			}
			const d = await r.json();
			if (weekStart !== weekAtPush) return;
			const pushed = (d.productsPushed ?? 0) + (d.freetextPushed ?? 0);
			const markedRefs = new Set<string>(d.markedBoughtRefs ?? []);
			if (d.reason === 'not_connected' && pushed === 0 && markedRefs.size === 0) {
				ahNotConnected = true;
				ahItems = null;
				return;
			}
			if (d.ok || d.uncertain || pushed > 0) {
				if (markedRefs.size) onMarkedBought(markedRefs);
				ahResult = {
					pushed,
					accountName: d.accountName ?? null,
					destination: d.destination ?? 'list',
					failed: d.failed ?? [],
					markedBought: markedRefs.size,
					uncertain: d.uncertain === true,
					reason: d.reason
				};
				ahItems = null;
			} else {
				ahError = d.reason ?? m.shopping_ah_error_push_failed_generic();
			}
		} catch {
			if (weekStart !== weekAtPush) return;
			// A lost client response is ambiguous even when the request reached
			// the server. Guide the household to inspect AH before any retry.
			ahResult = {
				pushed: 0,
				accountName: null,
				destination: 'list',
				failed: [],
				markedBought: 0,
				uncertain: true,
				reason: m.shopping_ah_error_connection_failed()
			};
			ahItems = null;
		} finally {
			if (weekStart === weekAtPush) ahPushing = false;
		}
	}
</script>

<BottomSheet
	bind:open={ahOpen}
	title={ahPushing ? m.shopping_ah_sending_title() : m.shopping_review_ah_order()}
	desktopSide
	dismissible={!ahPushing}
>
	{#if ahLoading}
		<div class="space-y-2 py-1" aria-label={m.shopping_ah_matching_products_aria()} role="status">
			<div class="flex items-center gap-2 px-1 pb-1 text-sm text-base-content/60">
				<Spinner size="xs" />
				<span>{m.shopping_ah_matching_products_aria()}</span>
			</div>
			{#each Array(3) as _}
				<div class="animate-pulse motion-reduce:animate-none rounded-2xl border border-base-300/60 p-3">
					<div class="h-4 w-1/3 rounded bg-base-200"></div>
					<div class="mt-3 flex items-center gap-2">
						<div class="h-10 w-10 shrink-0 rounded-lg bg-base-200"></div>
						<div class="min-w-0 flex-1 space-y-1.5">
							<div class="h-3.5 w-2/3 rounded bg-base-200"></div>
							<div class="h-3 w-1/3 rounded bg-base-200"></div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else if ahPushing}
		<div class="ah-sending" aria-live="polite" aria-busy="true" role="status">
			<Spinner />
			<h3>{m.shopping_ah_sending_title()}</h3>
			<p>{m.shopping_ah_sending_body()}</p>
		</div>
		<KitchenNotice tone="info">
			<div class="flex gap-2.5">
				<Icon name="clock" class="h-5 w-5 shrink-0 text-info" />
				<p class="text-sm leading-relaxed text-base-content/70">{m.shopping_ah_sending_lock()}</p>
			</div>
		</KitchenNotice>
	{:else if ahNotConnected}
		<KitchenNotice tone="warning" role="status">
			<div class="flex gap-2">
				<Icon name="warn" class="mt-0.5 h-5 w-5 shrink-0 text-warning" />
				<span>{m.shopping_ah_not_connected_body()}</span>
			</div>
		</KitchenNotice>
		<p class="mt-3 text-sm text-base-content/60">
			{m.shopping_ah_connect_first()}
		</p>
		<div class="mt-4 flex justify-end gap-2">
			<button type="button" class="ui-action ui-action-tertiary" onclick={() => (ahOpen = false)}>{m.ui_bottomsheet_close()}</button>
			<a href="{base}/settings/connections" class="ui-action ui-action-primary">{m.shopping_open_settings_button()}</a>
		</div>
	{:else if ahResult}
		<AhPushResult
			result={ahResult}
			onClose={() => {
				ahOpen = false;
				ahResult = null;
			}}
		/>
	{:else if ahStale}
		<KitchenNotice tone="warning" role="alert">
			<div class="flex gap-2.5">
				<Icon name="warn" class="h-5 w-5 shrink-0 text-warning" />
				<p class="text-sm leading-relaxed text-base-content/70">{m.shopping_ah_error_review_changed()}</p>
			</div>
		</KitchenNotice>
		<div class="mt-4 flex justify-end gap-2">
			<button type="button" class="ui-action ui-action-secondary" onclick={() => (ahOpen = false)}>{m.ui_bottomsheet_close()}</button>
			<button type="button" class="ui-action ui-action-primary" onclick={() => void openAhModal()}>{m.shopping_ah_review_again()}</button>
		</div>
	{:else if ahError}
		<KitchenNotice tone="error" role="alert">
			<div class="flex gap-2.5">
				<Icon name="warn" class="h-5 w-5 shrink-0 text-error" />
				<p class="text-sm leading-relaxed">{ahError}</p>
			</div>
		</KitchenNotice>
		<div class="mt-4 flex justify-end">
			<button type="button" class="ui-action ui-action-secondary" onclick={() => (ahOpen = false)}>{m.ui_bottomsheet_close()}</button>
		</div>
	{:else if ahItems}
		<ul class="mb-4 max-h-[55vh] space-y-2 overflow-y-auto" in:fade={{ duration: MOTION_MICRO_MS }}>
			{#each ahItems as item (item.ref)}
				<AhPreviewItem
					{item}
					dec={decisions[item.ref]}
					favoriteId={favorites[item.term]}
					expanded={expanded[item.ref]}
					onToggleExclude={() => toggleExclude(item.ref, item)}
					onPickProduct={(idx) => pickProduct(item.ref, idx)}
					onQuantityChange={(qty) => setQuantity(item.ref, qty)}
					onQuantityConfirm={() => confirmQuantity(item.ref)}
					onToggleFavorite={(cand, idx) => void toggleFavorite(item, cand, idx)}
					onDemoteToText={() => demoteToText(item.ref)}
					onToggleExpanded={() => (expanded = { ...expanded, [item.ref]: !expanded[item.ref] })}
				/>
			{/each}
		</ul>

		<div class="mb-2 text-xs text-base-content/50">
			{pushSummary.products === 1
				? m.shopping_ah_summary_products_singular({ count: pushSummary.products })
				: m.shopping_ah_summary_products_plural({ count: pushSummary.products })}, {m.shopping_ah_summary_as_text({ count: pushSummary.text })}{#if pushSummary.excluded}, {m.shopping_ah_summary_skipped({ count: pushSummary.excluded })}{/if}
		</div>
		<div class="flex justify-end gap-2">
			<button type="button" class="ui-action ui-action-tertiary" onclick={() => (ahOpen = false)}>{m.shopping_cancel_button()}</button>
			<button
				type="button"
				class="ui-action ui-action-primary"
				onclick={confirmPush}
				disabled={ahPushing || pushSummary.unconfirmed > 0 || pushSummary.unresolved > 0 || (pushSummary.products === 0 && pushSummary.text === 0)}
			>
				{#if ahPushing}
					<Spinner size="xs" />
					{m.shopping_ah_sending_label()}
				{:else}
					{m.shopping_send_to_ah_button()}
				{/if}
			</button>
		</div>
	{/if}
</BottomSheet>

<style>
	.ah-sending {
		display: grid;
		justify-items: center;
		gap: 0.55rem;
		padding: 2rem 1rem;
		text-align: center;
	}

	.ah-sending h3 {
		font-family: Georgia, 'Times New Roman', serif;
		font-size: 1.25rem;
	}

	.ah-sending p {
		color: color-mix(in oklab, var(--color-base-content) 68%, transparent);
		font-size: 0.82rem;
		line-height: 1.5;
	}
</style>
