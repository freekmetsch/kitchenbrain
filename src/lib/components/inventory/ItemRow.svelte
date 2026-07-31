<!--
	One text-forward stock row: swipe-to-delete backdrop, name, visible
	unit-aware quantity control, and one metadata line. The outer card owns the
	only optional urgency marker so ordinary rows do not accumulate dots and
	icons.
-->
<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { swipe } from '$lib/actions/swipe';
	import FacetChips from './FacetChips.svelte';
	import QtyControl from './QtyControl.svelte';
	import type { Item, RecipeLink, RecipeMatch } from './shared';

	let {
		item,
		link,
		matches,
		signalLabel = null,
		relationshipInteractive = false,
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
		relationshipInteractive?: boolean;
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
<div class="stock-item-row relative bg-[var(--stock-row-bg,var(--color-base-100))] px-3 py-2 {item.qtyNum === 0 ? 'opacity-65' : ''}" use:swipe={{ onSwipeLeft: () => onDelete() }}>
	<div class="stock-item-primary grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
		<div class="flex min-w-0 items-center">
			<button
				type="button"
				class="min-w-0 flex-1 truncate text-left text-sm font-medium leading-snug"
				onclick={() => onOpenEdit()}
				aria-label={m.inventory_row_edit_aria({ name: item.name })}>{item.name}</button
			>
		</div>
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

	<FacetChips
		{item}
		{link}
		{matches}
		{signalLabel}
		{relationshipInteractive}
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
