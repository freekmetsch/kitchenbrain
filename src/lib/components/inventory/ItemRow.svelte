<!--
	One stock row (V3 dense row): swipe-to-delete backdrop, aging accent bar,
	name + unit-aware quantity control, micro facet chips, and the in-place
	editor sheet. Rendered inside the page's <li> (the row enter/exit slide stays
	with its {#each} block); the page owns every write and threads intent back up
	through callbacks.
-->
<script lang="ts">
	import { swipe } from '$lib/actions/swipe';
	import { m } from '$lib/paraglide/messages';
	import FacetChips from './FacetChips.svelte';
	import QtyControl from './QtyControl.svelte';
	import { agingBar } from './shared';
	import type { Item, RecipeLink, RecipeMatch } from './shared';

	let {
		item,
		link,
		matches,
		signalLabel = null,
		qtyEditing,
		qtyEditVal = $bindable(),
		portionEditing,
		portionEditVal = $bindable(),
		stapleAdded,
		stapleBusy,
		onOpenEdit,
		onDelete,
		onStepQty,
		onOpenQtyEdit,
		onCommitQtyEdit,
		onCancelQtyEdit,
		onResolveReview,
		onAddStaple,
		onOpenLinkPicker,
		onOpenPortionEdit,
		onCommitPortionEdit,
		onCancelPortionEdit
	}: {
		item: Item;
		link: RecipeLink | null;
		matches: RecipeMatch[];
		signalLabel?: string | null;
		qtyEditing: boolean;
		qtyEditVal: string;
		portionEditing: boolean;
		portionEditVal: string;
		stapleAdded: boolean;
		stapleBusy: boolean;
		onOpenEdit: () => void;
		onDelete: () => void;
		onStepQty: (delta: number) => void;
		onOpenQtyEdit: () => void;
		onCommitQtyEdit: () => void;
		onCancelQtyEdit: () => void;
		onResolveReview: () => void;
		onAddStaple: () => void;
		onOpenLinkPicker: () => void;
		onOpenPortionEdit: () => void;
		onCommitPortionEdit: () => void;
		onCancelPortionEdit: () => void;
	} = $props();
</script>

<!-- swipe-left reveal (P6.6 #7): the row slides aside to expose this delete backdrop -->
<div class="pointer-events-none absolute inset-0 flex items-center justify-end bg-error/90 px-5 text-error-content" aria-hidden="true">
	<svg viewBox="0 0 16 16" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10M6.5 4.5V3.2h3V4.5M4.7 4.5l.4 8h5.8l.4-8M6.6 6.7v3.6M9.4 6.7v3.6" /></svg>
</div>
<div class="relative flex gap-2.5 bg-[var(--stock-row-bg,var(--color-base-100))] px-3 py-2.5 {item.qtyNum === 0 ? 'opacity-65' : ''}" use:swipe={{ onSwipeLeft: () => onDelete() }}>
	<span class="my-0.5 w-1 shrink-0 rounded-full {agingBar(item)}" aria-hidden="true"></span>
	<div class="min-w-0 flex-1">
		<div class="flex items-center gap-2">
			{#if item.needsReview}
				<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" title={m.inventory_row_needs_review_title()}></span>
			{/if}
			<button
				type="button"
				class="min-w-0 flex-1 truncate text-left text-sm font-medium leading-snug"
				onclick={() => onOpenEdit()}
				aria-label={m.inventory_row_edit_aria({ name: item.name })}>{item.name}</button
			>
			<QtyControl
				{item}
				target={link?.isFreezerStaple ? link.targetPortions : null}
				editing={qtyEditing}
				bind:value={qtyEditVal}
				onStep={onStepQty}
				onCommit={onCommitQtyEdit}
				onCancel={onCancelQtyEdit}
				onOpenEdit={onOpenQtyEdit}
				onOpenRowEdit={onOpenEdit}
			/>
		</div>

		{#if signalLabel}
			<p class="mt-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--stock-honey-ink,#7b5414)]">
				<span class="h-1.5 w-1.5 rounded-full bg-[var(--stock-honey,#d3a046)]"></span>
				{signalLabel}
			</p>
		{/if}

		<FacetChips
			{item}
			{link}
			{matches}
			{portionEditing}
			bind:portionValue={portionEditVal}
			{onOpenLinkPicker}
			{onOpenPortionEdit}
			{onCommitPortionEdit}
			{onCancelPortionEdit}
			{onOpenEdit}
			{onResolveReview}
			{stapleAdded}
			{stapleBusy}
			{onAddStaple}
		/>
	</div>
</div>
