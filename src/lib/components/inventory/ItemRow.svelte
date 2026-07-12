<!--
	One stock row (V3 dense row): swipe-to-delete backdrop, aging accent bar,
	name + unit-aware quantity control, micro facet chips, and the in-place
	editor. Rendered inside the page's <li> (the row enter/exit slide stays with
	its {#each} block); the page owns the single-open editor/qty/portion state
	and every write — this row threads intent back up through callbacks.
-->
<script lang="ts">
	import { swipe } from '$lib/actions/swipe';
	import FacetChips from './FacetChips.svelte';
	import ItemEditor from './ItemEditor.svelte';
	import QtyControl from './QtyControl.svelte';
	import { agingBar } from './shared';
	import type { EditDraft, HistoryEvent, Item, RecipeLink, RecipeMatch, RecipeSuggestion } from './shared';

	let {
		item,
		link,
		matches,
		suggestions,
		editing,
		qtyEditing,
		qtyEditVal = $bindable(),
		portionEditing,
		portionEditVal = $bindable(),
		history,
		draft = $bindable(),
		saving,
		onOpenEdit,
		onDelete,
		onStepQty,
		onOpenQtyEdit,
		onCommitQtyEdit,
		onCancelQtyEdit,
		onResolveReview,
		onSetRecipeStatus,
		onLinkRecipe,
		onClearRecipeStatus,
		onOpenLinkPicker,
		onOpenPortionEdit,
		onCommitPortionEdit,
		onCancelPortionEdit,
		onSaveEdit,
		onCancelEdit,
		onUndoEvent
	}: {
		item: Item;
		link: RecipeLink | null;
		matches: RecipeMatch[];
		suggestions: RecipeSuggestion[];
		editing: boolean;
		qtyEditing: boolean;
		qtyEditVal: string;
		portionEditing: boolean;
		portionEditVal: string;
		history: HistoryEvent[] | undefined;
		draft: EditDraft;
		saving: boolean;
		onOpenEdit: () => void;
		onDelete: () => void;
		onStepQty: (delta: number) => void;
		onOpenQtyEdit: () => void;
		onCommitQtyEdit: () => void;
		onCancelQtyEdit: () => void;
		onResolveReview: () => void;
		onSetRecipeStatus: (status: 'plan_to_add' | 'no_recipe') => void;
		onLinkRecipe: (s: RecipeSuggestion) => void;
		onClearRecipeStatus: () => void;
		onOpenLinkPicker: () => void;
		onOpenPortionEdit: () => void;
		onCommitPortionEdit: () => void;
		onCancelPortionEdit: () => void;
		onSaveEdit: () => void;
		onCancelEdit: () => void;
		onUndoEvent: (ev: HistoryEvent) => void;
	} = $props();
</script>

<!-- swipe-left reveal (P6.6 #7): the row slides aside to expose this delete backdrop -->
<div class="pointer-events-none absolute inset-0 flex items-center justify-end bg-error/90 px-5 text-error-content" aria-hidden="true">
	<svg viewBox="0 0 16 16" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10M6.5 4.5V3.2h3V4.5M4.7 4.5l.4 8h5.8l.4-8M6.6 6.7v3.6M9.4 6.7v3.6" /></svg>
</div>
<div class="relative flex gap-2.5 bg-base-100 px-3 py-2 {item.qtyNum === 0 ? 'opacity-60' : ''}" use:swipe={{ onSwipeLeft: () => onDelete() }}>
	<span class="my-0.5 w-1 shrink-0 rounded-full {agingBar(item)}" aria-hidden="true"></span>
	<div class="min-w-0 flex-1">
		<div class="flex items-center gap-2">
			{#if item.needsReview}
				<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" title="Needs review"></span>
			{/if}
			<button
				type="button"
				class="min-w-0 flex-1 truncate text-left text-sm font-medium leading-snug"
				onclick={() => onOpenEdit()}
				aria-label={`Edit ${item.name}`}>{item.name}</button
			>
			<QtyControl
				{item}
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
			{suggestions}
			{portionEditing}
			bind:portionValue={portionEditVal}
			{onLinkRecipe}
			{onOpenLinkPicker}
			{onSetRecipeStatus}
			{onClearRecipeStatus}
			{onOpenPortionEdit}
			{onCommitPortionEdit}
			{onCancelPortionEdit}
			{onOpenEdit}
			{onResolveReview}
		/>

		<ItemEditor
			{editing}
			{link}
			{matches}
			{history}
			bind:draft
			{saving}
			{onDelete}
			onCancel={onCancelEdit}
			onSave={onSaveEdit}
			{onUndoEvent}
		/>
	</div>
</div>
