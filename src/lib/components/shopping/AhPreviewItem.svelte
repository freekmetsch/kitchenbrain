<!--
	One item card in the AH preview sheet — the selected product (price, bonus,
	favorite star), the expandable candidate list, the per-item re-search form,
	and the freetext/skip states. All decision state lives in AhSheet; this
	card only reports the user's picks via callbacks.
-->
<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import KitchenNotice from '$lib/components/ui/KitchenNotice.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import type { PreviewItem } from '$lib/shopping_ah';
	import { slide } from 'svelte/transition';
	import { formatPrice, itemLabel } from './format';
	import type { Decision } from './types';
	import { MOTION_MICRO_MS } from '$lib/motion';

	type Props = {
		item: PreviewItem;
		dec: Decision | undefined;
		/** Household-favorite product id for this item's term, if any. */
		favoriteId: string | undefined;
		expanded: boolean | undefined;
		needsAttention?: boolean;
		searchTerm?: string;
		searching?: boolean;
		searchError?: string;
		searchEnabled?: boolean;
		onToggleExclude: () => void;
		onPickProduct: (idx: number) => void;
		onQuantityChange: (qty: number) => void;
		onQuantityConfirm: () => void;
		onToggleFavorite: (cand: PreviewItem['candidates'][number], idx: number) => void;
		onDemoteToText: () => void;
		onConfirmReview?: () => void;
		onSearchTermChange?: (term: string) => void;
		onSearch?: () => void;
		onToggleExpanded: () => void;
		showFavorite?: boolean;
		compact?: boolean;
	};
	let {
		item,
		dec,
		favoriteId,
		expanded,
		needsAttention = false,
		searchTerm = '',
		searching = false,
		searchError = '',
		searchEnabled = false,
		onToggleExclude,
		onPickProduct,
		onQuantityChange,
		onQuantityConfirm,
		onToggleFavorite,
		onDemoteToText,
		onConfirmReview = () => {},
		onSearchTermChange = () => {},
		onSearch = () => {},
		onToggleExpanded,
		showFavorite = true,
		compact = false
	}: Props = $props();

	// `dec` is always seeded by the preview, but stay defensive like the page
	// was: no decision reads as "first candidate". `pick` doubles as the
	// narrowed stand-in for `dec.pick` inside the product branch.
	const mode = $derived(dec?.mode);
	const pick = $derived(dec?.pick ?? 0);
	const sel = $derived(item.candidates[pick] ?? null);
	const searchId = $derived(`ah-search-${item.ref.replace(/[^a-zA-Z0-9_-]/g, '-')}`);
</script>

<li
	class="ah-preview-item focus:outline-none focus-visible:ring-2 focus-visible:ring-primary {compact ? 'ah-preview-item-compact' : ''} {mode === 'exclude' ? 'opacity-50' : ''}"
	data-ah-review-item
	data-ah-ref={item.ref}
	tabindex="-1"
>
	{#if compact && !expanded}
		<div class="ah-compact-row">
			<div class="ah-compact-ingredient">
				<strong>{item.term}</strong>
				{#if itemLabel(item)}<span>{itemLabel(item)}</span>{/if}
			</div>
			<span class="ah-compact-choice">
				{mode === 'product' && sel
					? sel.name
					: mode === 'exclude'
						? m.shopping_ah_review_skipped()
						: m.shopping_ah_review_as_text()}
			</span>
			{#if mode === 'product' && sel}
				<span class="ah-compact-price">×{dec?.qty ?? 1} · {formatPrice(sel.price)}</span>
			{/if}
			<button
				type="button"
				class="ui-action ui-action-tertiary"
				aria-expanded="false"
				onclick={() => onToggleExpanded()}
			>
				{m.shopping_ah_review_details()}
			</button>
		</div>
	{:else}
	<div class="flex items-start justify-between gap-2">
		<div class="min-w-0">
			<span class="text-sm font-medium">{item.term}</span>
			{#if itemLabel(item)}
				<span class="ml-1 text-xs text-base-content/50">{itemLabel(item)}</span>
			{/if}
		</div>
		<div class="flex shrink-0 items-center gap-1">
			{#if compact}
				<button
					type="button"
					class="ui-action ui-action-tertiary"
					aria-expanded="true"
					onclick={() => onToggleExpanded()}
				>
					{m.shopping_ah_review_hide_details()}
				</button>
			{/if}
			<button
				type="button"
				class="ui-action ui-action-tertiary"
				onclick={() => onToggleExclude()}
			>
				{mode === 'exclude' ? m.shopping_ah_undo_button() : m.shopping_ah_skip_button()}
			</button>
		</div>
	</div>
	{#if item.incompatibleQuantities}
		<KitchenNotice tone="warning" class="mt-2 text-xs">
			<div class="flex items-start gap-2">
				<Icon name="warn" class="mt-0.5 h-4 w-4 shrink-0 text-warning" />
				<div class="min-w-0 flex-1">
					<p class="text-base-content/75">{m.shopping_ah_quantity_review()}</p>
					<ul class="mt-1 space-y-0.5" aria-label={m.shopping_quantity_sources_label()}>
						{#each item.quantitySources as source}
							<li>
								<strong>{itemLabel(source) || source.name}</strong>
								{#if source.recipeTitle}<span class="text-base-content/60"> · {source.recipeTitle}</span>{/if}
							</li>
						{/each}
					</ul>
				</div>
			</div>
		</KitchenNotice>
	{/if}

	{#if mode === 'exclude'}
		<!-- Dimmed row + "Undo" button carry the skipped state; no explainer needed. -->
	{:else if mode === 'product' && sel}
		<div class="mt-2 flex items-center gap-2">
			{#if sel.imageUrl}
				<img src={sel.imageUrl} alt="" class="h-10 w-10 shrink-0 rounded-lg bg-base-200 object-cover" />
			{/if}
			<div class="min-w-0 flex-1">
				<div class="truncate text-sm">{sel.name}</div>
				<div class="text-xs text-base-content/50">
					{#if sel.salesUnitSize}{sel.salesUnitSize}{/if}
					{#if sel.unitPrice}<span> · {sel.unitPrice}</span>{/if}
					{#if sel.qty != null && sel.qty > 1}<span class="text-base-content/70"> · x{sel.qty}</span>{/if}
					{#if sel.isPreviouslyBought}<span class="ml-1 text-success">· {m.shopping_ah_bought_before()}</span>{/if}
				</div>
			</div>
			<div class="shrink-0 text-right">
				{#if sel.isBonus}
					<div class="text-sm font-semibold text-error">{formatPrice(sel.price)}</div>
					{#if sel.regularPrice && sel.regularPrice !== sel.price}
						<div class="text-xs text-base-content/40 line-through">{formatPrice(sel.regularPrice)}</div>
					{/if}
				{:else}
					<div class="text-sm font-semibold">{formatPrice(sel.price)}</div>
				{/if}
			</div>
		</div>
		{#if sel.isBonus && sel.bonusMechanism}
			<StatusBadge class="mt-1.5 w-fit" tone="error">{sel.bonusMechanism}</StatusBadge>
		{/if}
		<div class="mt-2 flex items-center justify-between gap-3 rounded-xl bg-base-200/60 px-2 py-1.5">
			<span class="text-xs text-base-content/60">{m.shopping_ah_pack_quantity()}</span>
			<div class="join" role="group" aria-label={m.shopping_ah_pack_quantity()}>
				<button type="button" class="btn join-item h-11 min-h-11 w-11 p-0" disabled={(dec?.qty ?? 1) <= 1} onclick={() => onQuantityChange((dec?.qty ?? 1) - 1)}>−</button>
				<input class="input join-item h-11 min-h-11 w-14 text-center tabular-nums" type="number" min="1" max="99" value={dec?.qty ?? 1} onchange={(event) => onQuantityChange(Number(event.currentTarget.value))} />
				<button type="button" class="btn join-item h-11 min-h-11 w-11 p-0" disabled={(dec?.qty ?? 1) >= 99} onclick={() => onQuantityChange((dec?.qty ?? 1) + 1)}>+</button>
			</div>
		</div>
		{#if item.incompatibleQuantities && !dec?.quantityConfirmed}
			<button type="button" class="ui-action ui-action-warning mt-2 w-full" onclick={onQuantityConfirm}>
				{m.shopping_ah_confirm_pack_quantity({ count: dec?.qty ?? 1 })}
			</button>
		{/if}
		{#if sel.pricePerCount != null}
			<p class="mt-1 text-right text-xs text-base-content/55">{m.shopping_ah_price_per_count({ price: formatPrice(sel.pricePerCount) })}</p>
		{/if}
		{#if item.lowConfidence}
			<p class="mt-1.5 text-xs text-warning">{m.shopping_ah_low_confidence()}</p>
		{/if}
		{#if needsAttention}
			<button
				type="button"
				class="ui-action ui-action-primary mt-2 w-full"
				disabled={item.incompatibleQuantities && !dec?.quantityConfirmed}
				onclick={onConfirmReview}
			>
				{m.shopping_ah_confirm_choice()}
			</button>
		{/if}
		<div class="mt-1 flex items-center gap-3 text-xs">
			{#if item.candidates.length > 1}
				<button
					type="button"
					class="min-h-11 text-primary"
					onclick={() => onToggleExpanded()}
				>
					{expanded ? m.shopping_ah_hide_options() : m.shopping_ah_other_options({ count: item.candidates.length - 1 })}
				</button>
			{/if}
			{#if showFavorite}
				<button
					type="button"
					class="flex min-h-11 min-w-11 items-center justify-center text-base leading-none {favoriteId === sel.id ? 'text-warning' : 'text-base-content/35'}"
					aria-pressed={favoriteId === sel.id}
					aria-label={favoriteId === sel.id ? m.shopping_ah_unpin_favorite_aria({ name: sel.name }) : m.shopping_ah_pin_favorite_aria({ name: sel.name })}
					onclick={() => onToggleFavorite(sel, pick)}
				>
					{favoriteId === sel.id ? '★' : '☆'}
				</button>
			{/if}
			<button type="button" class="min-h-11 text-base-content/50" onclick={() => onDemoteToText()}>{m.shopping_ah_send_as_text()}</button>
		</div>
		{#if expanded}
			<ul class="mt-2 max-h-64 space-y-1 overflow-y-auto border-t border-base-200 pt-2" transition:slide={{ duration: MOTION_MICRO_MS }}>
				{#each item.candidates as cand, idx (cand.id)}
					{#if idx !== pick}
					<li class="flex items-center gap-1">
						<button
							type="button"
							class="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-base-200 {idx === pick ? 'bg-base-200' : ''}"
							onclick={() => onPickProduct(idx)}
						>
							<span class="text-xs {idx === pick ? 'text-primary' : 'text-base-content/30'}">
								{idx === pick ? '●' : '○'}
							</span>
							{#if cand.imageUrl}
								<img src={cand.imageUrl} alt="" class="h-8 w-8 shrink-0 rounded-md bg-base-200 object-cover" />
							{/if}
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm">{cand.name}</span>
								<span class="block text-xs text-base-content/50">
									{#if cand.salesUnitSize}{cand.salesUnitSize}{/if}
									{#if cand.unitPrice} · {cand.unitPrice}{/if}
									{#if cand.isPreviouslyBought}<span class="text-success"> · {m.shopping_ah_bought_before()}</span>{/if}
								</span>
							</span>
							<span class="shrink-0 text-sm {cand.isBonus ? 'font-semibold text-error' : ''}">
								{formatPrice(cand.price)}
							</span>
						</button>
						{#if showFavorite}
							<button
								type="button"
								class="ui-action ui-action-tertiary ui-action-icon shrink-0 text-base {favoriteId === cand.id ? 'text-warning' : 'text-base-content/30'}"
								aria-label={favoriteId === cand.id ? m.shopping_ah_unpin_favorite_aria({ name: cand.name }) : m.shopping_ah_pin_favorite_aria({ name: cand.name })}
								aria-pressed={favoriteId === cand.id}
								onclick={() => onToggleFavorite(cand, idx)}
							>
								{favoriteId === cand.id ? '★' : '☆'}
							</button>
						{/if}
					</li>
					{/if}
				{/each}
			</ul>
		{/if}
	{:else if item.requiresExplicitDecision}
		<KitchenNotice tone="warning" class="mt-2 text-xs" role="status">
			<span class="flex items-start gap-2">
				<Icon name="warn" class="mt-0.5 h-4 w-4 shrink-0 text-warning" />
				<span class="text-base-content/75">
					{item.preferenceState === 'unavailable'
						? m.shopping_ah_recipe_preference_unavailable()
						: m.shopping_ah_recipe_preference_conflict()}
				</span>
			</span>
		</KitchenNotice>
		{#if item.candidates.length}
			<div class="mt-2 grid gap-1.5">
				{#each item.candidates.slice(0, 3) as candidate, index (candidate.id)}
					<button
						type="button"
						class="min-h-11 rounded-lg border border-base-300 px-2 py-1.5 text-left text-sm hover:bg-base-200"
						onclick={() => onPickProduct(index)}
					>
						<span class="block truncate">{candidate.name}</span>
						<span class="block text-xs text-base-content/50">
							{candidate.salesUnitSize ?? ''}{candidate.salesUnitSize && candidate.unitPrice ? ' · ' : ''}{candidate.unitPrice ?? ''}
						</span>
					</button>
				{/each}
			</div>
		{/if}
		<button type="button" class="mt-1 min-h-11 text-xs text-primary" onclick={() => onDemoteToText()}>
			{m.shopping_ah_send_as_text()}
		</button>
	{:else}
		<p class="mt-1.5 text-xs text-base-content/60">
			{item.status === 'unknown'
				? m.shopping_ah_status_unknown()
				: m.shopping_ah_status_no_match()}
		</p>
		{#if item.candidates.length}
			<div class="mt-2 grid max-h-64 gap-1.5 overflow-y-auto">
				{#each item.candidates as candidate, index (candidate.id)}
					<button
						type="button"
						class="min-h-11 rounded-lg border border-base-300 px-2 py-1.5 text-left text-sm hover:bg-base-200"
						onclick={() => onPickProduct(index)}
					>
						<span class="block truncate">{candidate.name}</span>
						<span class="block text-xs text-base-content/50">
							{candidate.salesUnitSize ?? ''}{candidate.salesUnitSize && candidate.unitPrice ? ' · ' : ''}{candidate.unitPrice ?? ''}
						</span>
					</button>
				{/each}
			</div>
		{/if}
		{#if needsAttention}
			<button type="button" class="mt-1 min-h-11 text-xs text-base-content/60" onclick={onDemoteToText}>
				{m.shopping_ah_send_as_text()}
			</button>
		{/if}
	{/if}
	{#if searchEnabled}
	<form
		class="mt-2 flex items-end gap-2 border-t border-base-200 pt-2"
		onsubmit={(event) => {
			event.preventDefault();
			onSearch();
		}}
	>
		<label class="min-w-0 flex-1" for={searchId}>
			<span class="sr-only">{m.shopping_ah_search_label({ name: item.term })}</span>
			<input
				id={searchId}
				class="input input-bordered h-11 min-h-11 w-full text-sm"
				type="search"
				maxlength="100"
				placeholder={m.shopping_ah_search_placeholder()}
				value={searchTerm}
				disabled={searching}
				oninput={(event) => onSearchTermChange(event.currentTarget.value)}
			/>
		</label>
		<button
			type="submit"
			class="ui-action ui-action-secondary"
			disabled={searching || !searchTerm.trim()}
		>
			{#if searching}<Spinner size="xs" />{/if}
			{searching ? m.shopping_ah_searching_label() : m.shopping_ah_search_button()}
		</button>
	</form>
	{#if searchError}
		<p class="mt-1 text-xs text-warning" role="status">{searchError}</p>
	{/if}
	{/if}
	{/if}
</li>

<style>
	.ah-preview-item {
		min-width: 0;
		padding: 0.7rem;
		border: 1px solid color-mix(in oklab, var(--kitchen-olive) 14%, var(--kitchen-line));
		border-radius: 0.8rem;
		background: var(--kitchen-card);
		box-shadow: 0 3px 10px rgb(35 58 46 / 6%);
	}

	.ah-preview-item-compact {
		padding: 0.25rem 0.35rem 0.25rem 0.65rem;
		box-shadow: none;
	}

	.ah-preview-item-compact:has(> :not(.ah-compact-row)) {
		padding: 0.7rem;
	}

	.ah-compact-row {
		display: grid;
		grid-template-columns: minmax(5rem, 0.8fr) minmax(4.5rem, 1.4fr) auto auto;
		align-items: center;
		gap: 0.45rem;
		min-height: 2.75rem;
	}

	.ah-compact-ingredient,
	.ah-compact-choice {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ah-compact-ingredient {
		display: grid;
	}

	.ah-compact-ingredient strong {
		overflow: hidden;
		font-size: 0.76rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ah-compact-ingredient span,
	.ah-compact-choice,
	.ah-compact-price {
		color: color-mix(in oklab, var(--color-base-content) 62%, transparent);
		font-size: 0.68rem;
	}

	.ah-compact-price {
		color: var(--color-base-content);
		font-weight: 760;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.ah-compact-row :global(.ui-action) {
		padding-inline: 0.55rem;
		font-size: 0.68rem;
	}

	@media (max-width: 23rem) {
		.ah-compact-row {
			grid-template-columns: minmax(4.5rem, 0.8fr) minmax(4rem, 1fr) auto;
			gap: 0.3rem;
		}

		.ah-compact-price {
			display: none;
		}
	}
</style>
