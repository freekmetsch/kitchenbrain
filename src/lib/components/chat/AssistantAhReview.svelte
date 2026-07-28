<script lang="ts">
	import { base } from '$app/paths';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { PreviewItem } from '$lib/shopping_ah';
	import AhPreviewItem from '$lib/components/shopping/AhPreviewItem.svelte';
	import AhPushResult from '$lib/components/shopping/AhPushResult.svelte';
	import type {
		AhPushOutcome,
		Decision
	} from '$lib/components/shopping/types';

	type Props = {
		previewToken: string;
		items: PreviewItem[];
		onExternalAttempt?: () => void;
	};

	let { previewToken, items, onExternalAttempt }: Props = $props();
	let decisions = $state<Record<string, Decision>>({});
	let expanded = $state<Record<string, boolean>>({});
	let initializedFor = $state('');
	let pushing = $state(false);
	let stale = $state(false);
	let errorMessage = $state('');
	let result = $state<AhPushOutcome | null>(null);

	$effect(() => {
		const key = `${previewToken}:${items.map((item) => item.ref).join(',')}`;
		if (key === initializedFor) return;
		initializedFor = key;
		const next: Record<string, Decision> = {};
		for (const item of items) {
			if (item.requiresExplicitDecision) continue;
			next[item.ref] = {
				mode: item.status === 'product' ? 'product' : 'freetext',
				pick: 0,
				qty: item.candidates[0]?.qty ?? 1,
				quantityConfirmed: !item.incompatibleQuantities
			};
		}
		decisions = next;
		expanded = {};
		stale = false;
		errorMessage = '';
		result = null;
	});

	let summary = $derived.by(() => {
		let products = 0;
		let text = 0;
		let excluded = 0;
		let unconfirmed = 0;
		let unresolved = 0;
		for (const item of items) {
			const decision = decisions[item.ref];
			if (!decision) {
				if (item.requiresExplicitDecision) unresolved++;
				else excluded++;
			} else if (decision.mode === 'exclude') excluded++;
			else if (decision.mode === 'product' && item.candidates[decision.pick]) {
				products++;
				if (item.incompatibleQuantities && !decision.quantityConfirmed) unconfirmed++;
			} else text++;
		}
		return { products, text, excluded, unconfirmed, unresolved };
	});

	function pickProduct(ref: string, index: number) {
		const item = items.find((entry) => entry.ref === ref);
		decisions = {
			...decisions,
			[ref]: {
				mode: 'product',
				pick: index,
				qty: item?.candidates[index]?.qty ?? 1,
				quantityConfirmed: !item?.incompatibleQuantities
			}
		};
		expanded = { ...expanded, [ref]: false };
	}

	function setQuantity(ref: string, quantity: number) {
		const current = decisions[ref];
		if (!current) return;
		const safe = Number.isFinite(quantity)
			? Math.max(1, Math.min(99, Math.round(quantity)))
			: current.qty;
		decisions = {
			...decisions,
			[ref]: { ...current, qty: safe, quantityConfirmed: true }
		};
	}

	function confirmQuantity(ref: string) {
		const current = decisions[ref];
		if (!current) return;
		decisions = {
			...decisions,
			[ref]: { ...current, quantityConfirmed: true }
		};
	}

	function demoteToText(ref: string) {
		decisions = {
			...decisions,
			[ref]: {
				mode: 'freetext',
				pick: 0,
				qty: 1,
				quantityConfirmed: true
			}
		};
		expanded = { ...expanded, [ref]: false };
	}

	function toggleExclude(ref: string, item: PreviewItem) {
		const current = decisions[ref];
		if (item.requiresExplicitDecision && current?.mode === 'exclude') {
			const { [ref]: _removed, ...remaining } = decisions;
			decisions = remaining;
			return;
		}
		const fallback: Decision =
			item.status === 'product'
				? {
						mode: 'product',
						pick: current?.pick ?? 0,
						qty: current?.qty ?? 1,
						quantityConfirmed:
							current?.quantityConfirmed ?? !item.incompatibleQuantities
					}
				: {
						mode: 'freetext',
						pick: 0,
						qty: 1,
						quantityConfirmed: true
					};
		decisions = {
			...decisions,
			[ref]:
				current?.mode === 'exclude'
					? fallback
					: {
							mode: 'exclude',
							pick: current?.pick ?? 0,
							qty: current?.qty ?? 1,
							quantityConfirmed: true
						}
		};
	}

	async function confirmPush() {
		if (summary.unresolved > 0) {
			errorMessage = m.shopping_ah_preference_resolution_required();
			return;
		}
		const pushDecisions = items.map((item) => {
			const decision = decisions[item.ref];
			const product =
				decision?.mode === 'product' ? item.candidates[decision.pick] : null;
			return decision?.mode === 'product' && product
				? {
						ref: item.ref,
						mode: 'product' as const,
						productId: product.id,
						qty: decision.qty,
						quantityConfirmed: decision.quantityConfirmed
					}
				: {
						ref: item.ref,
						mode:
							decision?.mode === 'freetext'
								? ('freetext' as const)
								: ('exclude' as const)
					};
		});
		if (pushDecisions.every((decision) => decision.mode === 'exclude')) {
			errorMessage = m.shopping_ah_error_all_skipped();
			return;
		}
		pushing = true;
		errorMessage = '';
		try {
			const response = await fetch(`${base}/api/shopping/ah-push`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ previewToken, decisions: pushDecisions })
			});
			if (response.status === 409) {
				stale = true;
				return;
			}
			if (!response.ok) {
				result = {
					pushed: 0,
					accountName: null,
					destination: 'list',
					failed: [],
					markedBought: 0,
					uncertain: true,
					reason: m.shopping_ah_error_push_failed()
				};
				onExternalAttempt?.();
				return;
			}
			const body = await response.json();
			const pushed = (body.productsPushed ?? 0) + (body.freetextPushed ?? 0);
			if (body.reason === 'not_connected' && pushed === 0) {
				errorMessage = m.shopping_ah_not_connected_body();
				return;
			}
			result = {
				pushed,
				accountName: body.accountName ?? null,
				destination: body.destination ?? 'list',
				failed: body.failed ?? [],
				markedBought: body.markedBoughtRefs?.length ?? 0,
				uncertain: body.uncertain === true,
				reason: body.reason
			};
			if (pushed > 0 || body.uncertain === true) onExternalAttempt?.();
		} catch {
			result = {
				pushed: 0,
				accountName: null,
				destination: 'list',
				failed: [],
				markedBought: 0,
				uncertain: true,
				reason: m.shopping_ah_error_connection_failed()
			};
			onExternalAttempt?.();
		} finally {
			pushing = false;
		}
	}
</script>

<section class="mt-3 border-t border-base-300/70 pt-3" aria-label={m.shopping_review_ah_order()}>
	<header class="mb-2 flex items-start gap-2">
		<Icon name="basket" class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
		<div>
			<h4 class="text-sm font-semibold">{m.shopping_review_ah_order()}</h4>
			<p class="text-xs leading-relaxed text-base-content/60">{m.chat_ah_preview_ready()}</p>
		</div>
	</header>

	{#if result}
		<AhPushResult {result} onClose={() => (result = null)} />
	{:else if stale}
		<div class="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs" role="alert">
			{m.shopping_ah_error_review_changed()}
		</div>
	{:else}
		<ul class="max-h-[55vh] space-y-2 overflow-y-auto">
			{#each items as item (item.ref)}
				<AhPreviewItem
					{item}
					dec={decisions[item.ref]}
					favoriteId={undefined}
					expanded={expanded[item.ref]}
					showFavorite={false}
					onToggleExclude={() => toggleExclude(item.ref, item)}
					onPickProduct={(index) => pickProduct(item.ref, index)}
					onQuantityChange={(quantity) => setQuantity(item.ref, quantity)}
					onQuantityConfirm={() => confirmQuantity(item.ref)}
					onToggleFavorite={() => undefined}
					onDemoteToText={() => demoteToText(item.ref)}
					onToggleExpanded={() =>
						(expanded = { ...expanded, [item.ref]: !expanded[item.ref] })}
				/>
			{/each}
		</ul>

		<p class="mt-2 text-xs text-base-content/55">{m.chat_ah_external_warning()}</p>
		{#if errorMessage}
			<p class="mt-2 text-xs text-error" role="alert">{errorMessage}</p>
		{/if}
		<div class="mt-3 flex items-center justify-between gap-2">
			<span class="text-xs text-base-content/50">
				{m.shopping_ah_summary_products_plural({ count: summary.products })},
				{m.shopping_ah_summary_as_text({ count: summary.text })}
			</span>
			<button
				type="button"
				class="btn btn-primary min-h-11"
				disabled={pushing ||
					summary.unconfirmed > 0 ||
					summary.unresolved > 0 ||
					(summary.products === 0 && summary.text === 0)}
				onclick={confirmPush}
			>
				{#if pushing}<Spinner size="xs" />{/if}
				{pushing ? m.shopping_ah_sending_label() : m.shopping_send_to_ah_button()}
			</button>
		</div>
	{/if}
</section>
