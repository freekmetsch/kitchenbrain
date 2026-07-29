<!--
	One item card in the AH preview sheet — the selected product (price, bonus,
	favorite star), the expandable candidate list, the per-item re-search form,
	and the freetext/skip states. All decision state lives in AhSheet; this
	card only reports the user's picks via callbacks.
-->
<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { PreviewItem } from '$lib/shopping_ah';
	import { slide } from 'svelte/transition';
	import { formatPrice, itemLabel } from './format';
	import type { Decision } from './types';
	import { MOTION_MICRO_MS } from '$lib/motion';
	import type { PreviewConflict } from '$lib/shopping_ah';

	type Props = {
		item: PreviewItem;
		dec: Decision | undefined;
		/** Household-favorite product id for this item's term, if any. */
		favoriteId: string | undefined;
		expanded: boolean | undefined;
		onToggleExclude: () => void;
		onPickProduct: (idx: number) => void;
		onQuantityChange: (qty: number) => void;
		onQuantityConfirm: () => void;
		onToggleFavorite: (cand: PreviewItem['candidates'][number], idx: number) => void;
		onDemoteToText: () => void;
		onToggleExpanded: () => void;
		showFavorite?: boolean;
	};
	let {
		item,
		dec,
		favoriteId,
		expanded,
		onToggleExclude,
		onPickProduct,
		onQuantityChange,
		onQuantityConfirm,
		onToggleFavorite,
		onDemoteToText,
		onToggleExpanded,
		showFavorite = true
	}: Props = $props();

	// `dec` is always seeded by the preview, but stay defensive like the page
	// was: no decision reads as "first candidate". `pick` doubles as the
	// narrowed stand-in for `dec.pick` inside the product branch.
	const mode = $derived(dec?.mode);
	const pick = $derived(dec?.pick ?? 0);
	const sel = $derived(item.candidates[pick] ?? null);
	const sourceConflicts = $derived(
		(item.conflicts ?? []).filter((conflict) => conflict.kind !== 'incompatible_quantity')
	);

	function conflictMessage(conflict: PreviewConflict): string {
		if (conflict.kind === 'duplicate_quantity') {
			return m.shopping_ah_conflict_duplicate_quantity();
		}
		if (conflict.kind === 'manual_recipe_overlap') {
			return m.shopping_ah_conflict_manual_recipe();
		}
		return m.shopping_ah_conflict_many_sources({ count: conflict.sourceCount });
	}
</script>

<li class="rounded-2xl border border-base-300 p-3 {mode === 'exclude' ? 'opacity-50' : ''}">
	<div class="flex items-start justify-between gap-2">
		<div class="min-w-0">
			<span class="text-sm font-medium">{item.term}</span>
			{#if itemLabel(item)}
				<span class="ml-1 text-xs text-base-content/50">{itemLabel(item)}</span>
			{/if}
		</div>
		<button
			type="button"
			class="btn btn-ghost min-h-11 shrink-0"
			onclick={() => onToggleExclude()}
		>
			{mode === 'exclude' ? m.shopping_ah_undo_button() : m.shopping_ah_skip_button()}
		</button>
	</div>
	{#if item.incompatibleQuantities}
		<div class="mt-2 rounded-xl border border-warning/30 bg-warning/10 px-2.5 py-2">
			<p class="text-xs text-base-content/75">{m.shopping_ah_quantity_review()}</p>
			<ul class="mt-1 space-y-0.5 text-xs" aria-label={m.shopping_quantity_sources_label()}>
				{#each item.quantitySources as source}
					<li>
						<strong>{itemLabel(source) || source.name}</strong>
						{#if source.recipeTitle}<span class="text-base-content/60"> · {source.recipeTitle}</span>{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
	{#if sourceConflicts.length > 0}
		<div
			class="mt-2 rounded-xl border border-warning/30 bg-warning/10 px-2.5 py-2"
			data-testid="ah-source-conflicts"
		>
			<p class="text-xs font-medium text-base-content/80">
				{m.shopping_ah_source_conflicts_title()}
			</p>
			<ul class="mt-1 list-disc space-y-0.5 pl-4 text-xs text-base-content/70">
				{#each sourceConflicts as conflict}
					<li>{conflictMessage(conflict)}</li>
				{/each}
			</ul>
			<p class="mt-1 text-xs text-base-content/60">
				{m.shopping_ah_source_conflicts_consequence()}
			</p>
		</div>
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
			<div class="ui-chip-active mt-1.5 w-fit border-error/40 bg-error/10 text-error">{sel.bonusMechanism}</div>
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
			<button type="button" class="btn btn-warning btn-outline mt-2 min-h-11 w-full" onclick={onQuantityConfirm}>
				{m.shopping_ah_confirm_pack_quantity({ count: dec?.qty ?? 1 })}
			</button>
		{/if}
		{#if sel.pricePerCount != null}
			<p class="mt-1 text-right text-xs text-base-content/55">{m.shopping_ah_price_per_count({ price: formatPrice(sel.pricePerCount) })}</p>
		{/if}
		{#if showFavorite}
			<section class="mt-2 rounded-xl border border-base-300/70 bg-base-100/55 p-2.5">
				<p class="text-xs font-semibold">{m.shopping_ah_choice_scope()}</p>
				{#if favoriteId === sel.id}
					<p class="mt-1 text-xs leading-relaxed text-base-content/65">
						{m.shopping_ah_scope_household_saved({ term: item.term })}
					</p>
					<button
						type="button"
						class="btn btn-ghost btn-sm mt-1.5 min-h-11 w-full"
						aria-label={m.shopping_ah_unpin_favorite_aria({ name: sel.name })}
						onclick={() => onToggleFavorite(sel, pick)}
					>
						{m.shopping_ah_scope_forget()}
					</button>
				{:else}
					<p class="mt-1 text-xs leading-relaxed text-base-content/65">
						{m.shopping_ah_scope_this_push()}
					</p>
					<button
						type="button"
						class="btn btn-outline btn-sm mt-1.5 min-h-11 w-full"
						aria-label={m.shopping_ah_pin_favorite_aria({ name: sel.name })}
						onclick={() => onToggleFavorite(sel, pick)}
					>
						{favoriteId
							? m.shopping_ah_scope_replace_household()
							: m.shopping_ah_scope_save_household()}
					</button>
				{/if}
				<p class="mt-1.5 text-[0.68rem] leading-relaxed text-base-content/50">
					{m.shopping_ah_scope_recipe_elsewhere()}
				</p>
			</section>
		{/if}
		{#if item.lowConfidence}
			<p class="mt-1.5 text-xs text-warning">{m.shopping_ah_low_confidence()}</p>
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
			<button type="button" class="min-h-11 text-base-content/50" onclick={() => onDemoteToText()}>{m.shopping_ah_send_as_text()}</button>
		</div>
		{#if expanded}
			<ul class="mt-2 max-h-64 space-y-1 overflow-y-auto border-t border-base-200 pt-2" transition:slide={{ duration: MOTION_MICRO_MS }}>
				{#each item.candidates as cand, idx (cand.id)}
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
					</li>
				{/each}
			</ul>
		{/if}
	{:else if item.requiresExplicitDecision}
		<div class="mt-2 rounded-xl border border-warning/30 bg-warning/10 px-2.5 py-2" role="status">
			<p class="text-xs text-base-content/75">
				{sourceConflicts.length > 0
					? m.shopping_ah_source_conflict_decision()
					: item.preferenceState === 'unavailable'
					? m.shopping_ah_recipe_preference_unavailable()
					: m.shopping_ah_recipe_preference_conflict()}
			</p>
		</div>
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
			<button
				type="button"
				class="mt-1 min-h-11 text-xs text-primary"
				onclick={() => onPickProduct(0)}
			>
				{m.shopping_ah_use_product_instead()}
			</button>
		{/if}
	{/if}
</li>
