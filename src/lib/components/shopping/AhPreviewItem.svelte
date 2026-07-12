<!--
	One item card in the AH preview sheet — the selected product (price, bonus,
	favorite star), the expandable candidate list, the per-item re-search form,
	and the freetext/skip states. All decision state lives in AhSheet; this
	card only reports the user's picks via callbacks.
-->
<script lang="ts">
	import type { PreviewItem } from '$lib/shopping_ah';
	import { slide } from 'svelte/transition';
	import { formatPrice, itemLabel } from './format';
	import type { Decision } from './types';

	type Props = {
		item: PreviewItem;
		dec: Decision | undefined;
		/** Household-favorite product id for this item's term, if any. */
		favoriteId: string | undefined;
		expanded: boolean | undefined;
		searching: boolean | undefined;
		searchTerm?: string;
		onToggleExclude: () => void;
		onPickProduct: (idx: number) => void;
		onToggleFavorite: (cand: PreviewItem['candidates'][number], idx: number) => void;
		onDemoteToText: () => void;
		onToggleExpanded: () => void;
		onSearch: () => void;
	};
	let {
		item,
		dec,
		favoriteId,
		expanded,
		searching,
		searchTerm = $bindable(''),
		onToggleExclude,
		onPickProduct,
		onToggleFavorite,
		onDemoteToText,
		onToggleExpanded,
		onSearch
	}: Props = $props();

	// `dec` is always seeded by the preview, but stay defensive like the page
	// was: no decision reads as "first candidate". `pick` doubles as the
	// narrowed stand-in for `dec.pick` inside the product branch.
	const mode = $derived(dec?.mode);
	const pick = $derived(dec?.pick ?? 0);
	const sel = $derived(item.candidates[pick] ?? null);
</script>

{#snippet ahSearchForm()}
	<form
		class="mt-2 flex items-center gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			onSearch();
		}}
	>
		<input
			type="text"
			class="input input-sm input-bordered min-w-0 flex-1"
			placeholder="Search AH for something else..."
			autocomplete="off"
			bind:value={searchTerm}
		/>
		<button
			type="submit"
			class="btn btn-sm shrink-0"
			disabled={searching || !(searchTerm ?? '').trim()}
		>
			{searching ? 'Searching...' : 'Search'}
		</button>
	</form>
{/snippet}

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
			class="btn btn-ghost btn-xs shrink-0"
			onclick={() => onToggleExclude()}
		>
			{mode === 'exclude' ? 'Undo' : 'Skip'}
		</button>
	</div>

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
					{#if sel.qty > 1}<span class="text-base-content/70"> · x{sel.qty}</span>{/if}
					{#if sel.isPreviouslyBought}<span class="ml-1 text-success">· bought before</span>{/if}
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
		{#if item.lowConfidence}
			<p class="mt-1.5 text-xs text-warning">Not an exact name match -- check this is right.</p>
		{/if}
		<div class="mt-1 flex items-center gap-3 text-xs">
			{#if item.candidates.length > 1}
				<button
					type="button"
					class="py-1.5 text-primary"
					onclick={() => onToggleExpanded()}
				>
					{expanded ? 'Hide options' : `Other options (${item.candidates.length - 1})`}
				</button>
			{/if}
			<button
				type="button"
				class="flex min-h-11 min-w-11 items-center justify-center text-base leading-none {favoriteId === sel.id ? 'text-warning' : 'text-base-content/35'}"
				aria-pressed={favoriteId === sel.id}
				aria-label={favoriteId === sel.id ? `Unpin ${sel.name} as favorite` : `Pin ${sel.name} as favorite`}
				onclick={() => onToggleFavorite(sel, pick)}
			>
				{favoriteId === sel.id ? '★' : '☆'}
			</button>
			<button type="button" class="py-1.5 text-base-content/50" onclick={() => onDemoteToText()}>Send as text</button>
		</div>
		{#if expanded}
			<ul class="mt-2 max-h-64 space-y-1 overflow-y-auto border-t border-base-200 pt-2" transition:slide={{ duration: 150 }}>
				{#each item.candidates as cand, idx (cand.id)}
					<li class="flex items-center gap-1">
						<button
							type="button"
							class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-base-200 {idx === pick ? 'bg-base-200' : ''}"
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
									{#if cand.isPreviouslyBought}<span class="text-success"> · bought before</span>{/if}
								</span>
							</span>
							<span class="shrink-0 text-sm {cand.isBonus ? 'font-semibold text-error' : ''}">
								{formatPrice(cand.price)}
							</span>
						</button>
						<button
							type="button"
							class="btn btn-ghost btn-xs h-11 w-11 shrink-0 px-0 text-base {favoriteId === cand.id ? 'text-warning' : 'text-base-content/30'}"
							aria-label={favoriteId === cand.id ? `Unpin ${cand.name} as favorite` : `Pin ${cand.name} as favorite`}
							aria-pressed={favoriteId === cand.id}
							onclick={() => onToggleFavorite(cand, idx)}
						>
							{favoriteId === cand.id ? '★' : '☆'}
						</button>
					</li>
				{/each}
			</ul>
			{@render ahSearchForm()}
		{/if}
	{:else}
		<p class="mt-1.5 text-xs text-base-content/60">
			{item.status === 'unknown'
				? 'Could not search AH — will be sent as a free-text line.'
				: 'No product match — try another search word, or it goes as a free-text line.'}
		</p>
		{#if item.candidates.length}
			<button
				type="button"
				class="mt-1 text-xs text-primary"
				onclick={() => onPickProduct(0)}
			>
				Use a product instead
			</button>
		{/if}
		{@render ahSearchForm()}
	{/if}
</li>
