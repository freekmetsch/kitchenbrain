<!--
	Text-forward Stock metadata. Ordinary rows use words and whitespace instead
	of section emoji, food emoji, ageing dots, review dots, and nested status
	badges. Recovery controls remain explicit when a row actually needs work.
-->
<script module lang="ts">
	import { base } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import { RULE_REVIEW_CODES, reasonTokens } from '$lib/review_reasons';
	import type { Item } from './shared';

	function reviewReasonLabel(key: string): string | undefined {
		switch (key) {
			case 'undo_conflict': return m.inventory_review_reason_undo_conflict();
			case 'unclassified': return m.inventory_review_reason_unclassified();
			case 'unknown_kind': return m.inventory_review_reason_unknown_kind();
			case 'unknown_food_class': return m.inventory_review_reason_unknown_food_class();
			case 'non_canonical_unit': return m.inventory_review_reason_non_canonical_unit();
			case 'leftover_non_portion_unit': return m.inventory_review_reason_leftover_non_portion_unit();
			case 'leftover_non_integer_portions': return m.inventory_review_reason_leftover_non_integer_portions();
			case 'manual_check': return m.inventory_review_reason_manual_check();
			default: return undefined;
		}
	}

	function reviewReasonText(reason: string | null): string {
		return reasonTokens(reason)
			.map((part) => {
				const key = part.split(':')[0];
				return reviewReasonLabel(key) ?? key.replace(/_/g, ' ');
			})
			.join(' · ');
	}

	function reviewFix(item: Item): 'portions' | 'edit' | 'resolve' {
		const codes = reasonTokens(item.reviewReason).map((token) => token.split(':')[0]);
		if (
			codes.includes('leftover_non_portion_unit') ||
			codes.includes('leftover_non_integer_portions')
		) {
			return 'portions';
		}
		if (codes.some((code) => RULE_REVIEW_CODES.has(code))) return 'edit';
		return 'resolve';
	}

	function recipeSearchHref(name: string): string {
		return base + '/recipes?' + new URLSearchParams({ ingredient: name }).toString();
	}
</script>

<script lang="ts">
	import {
		autofocus,
		foodClassText,
		recipeRelationshipKind
	} from './shared';
	import type { RecipeLink, RecipeMatch } from './shared';

	let {
		item,
		link,
		matches,
		signalLabel = null,
		relationshipInteractive = false,
		portionEditing,
		portionValue = $bindable(),
		onOpenLinkPicker,
		onOpenPortionEdit,
		onCommitPortionEdit,
		onCancelPortionEdit,
		onOpenEdit,
		onResolveReview,
		stapleAdded,
		stapleBusy,
		onAddStaple
	}: {
		item: Item;
		link: RecipeLink | null;
		matches: RecipeMatch[];
		signalLabel?: string | null;
		relationshipInteractive?: boolean;
		portionEditing: boolean;
		portionValue: string;
		onOpenLinkPicker: () => void;
		onOpenPortionEdit: () => void;
		onCommitPortionEdit: () => void;
		onCancelPortionEdit: () => void;
		onOpenEdit: () => void;
		onResolveReview: () => void;
		stapleAdded: boolean;
		stapleBusy: boolean;
		onAddStaple: () => void;
	} = $props();

	const relationship = $derived(recipeRelationshipKind(item, link));
	const sectionLabel = $derived(
		item.section === 'freezer' ? m.inventory_section_freezer() : m.inventory_section_pantry()
	);
	const relationshipLabel = $derived(
		relationship === 'linked'
			? m.inventory_recipe_linked_label({
					title: link?.title ?? m.inventory_recipe_link_default()
				})
			: relationship === 'planned'
				? m.inventory_recipe_planned_label()
				: relationship === 'not_needed'
					? m.inventory_recipe_no_recipe_label()
					: m.inventory_recipe_unresolved_label()
	);
</script>

<div class="stock-card-meta">
	{#if signalLabel}
		<strong class="stock-signal">{signalLabel}</strong>
	{/if}

	<span>{sectionLabel}</span>

	{#if item.kind === 'leftover'}
		{#if relationship !== 'unresolved' || relationshipInteractive}
			{#if relationshipInteractive}
				<button
					type="button"
					class="stock-meta-link"
					aria-label={relationshipLabel + '. ' + m.inventory_recipe_manage_button()}
					onclick={onOpenLinkPicker}
				>
					{relationshipLabel}
				</button>
			{:else}
				<span>{relationshipLabel}</span>
			{/if}
		{/if}
	{:else if item.foodClass}
		<span>{foodClassText(item.foodClass)}</span>
	{/if}

	{#if item.isStaple}
		<span>{m.inventory_staple_label()}</span>
	{/if}

	{#if item.qtyNum === 0}
		<strong class="stock-warning">
			{item.kind === 'leftover' && link?.isFreezerStaple
				? m.inventory_cook_again_badge()
				: m.inventory_out_badge()}
		</strong>
		{#if item.isStaple}
			<button
				type="button"
				class="stock-meta-link"
				disabled={stapleBusy || stapleAdded}
				aria-label={stapleAdded
					? m.inventory_staples_on_list()
					: m.inventory_staples_add_aria({ name: item.name })}
				onclick={onAddStaple}
			>
				{stapleAdded ? m.inventory_staples_on_list() : m.inventory_staples_add_button()}
			</button>
		{/if}
	{/if}

	{#if matches.length > 0}
		<a href={recipeSearchHref(item.name)} class="stock-meta-link">
			{matches.length === 1
				? m.inventory_matches_singular({ count: matches.length })
				: m.inventory_matches_plural({ count: matches.length })}
		</a>
	{/if}
</div>

{#if item.needsReview}
	<div class="stock-review-row">
		<span class="stock-review-copy">
			{item.reviewReason
				? reviewReasonText(item.reviewReason)
				: m.inventory_row_needs_review_title()}
		</span>
		{#if portionEditing}
			<span class="stock-review-actions">
				<input
					type="number"
					inputmode="numeric"
					min="0"
					step="1"
					class="ui-field w-14 px-1 text-center tabular-nums"
					bind:value={portionValue}
					use:autofocus
					onkeydown={(event) => {
						if (event.key === 'Enter') onCommitPortionEdit();
						else if (event.key === 'Escape') onCancelPortionEdit();
					}}
					aria-label={m.inventory_portion_count_aria({ name: item.name })}
				/>
				<button
					type="button"
					class="ui-action ui-action-tertiary"
					onmousedown={(event) => event.preventDefault()}
					onclick={onCommitPortionEdit}
				>
					{m.inventory_portion_save_button()}
				</button>
			</span>
		{:else if reviewFix(item) === 'portions'}
			<button type="button" class="ui-action ui-action-tertiary" onclick={onOpenPortionEdit}>
				{m.inventory_set_portions_button()}
			</button>
		{:else if reviewFix(item) === 'edit'}
			<button type="button" class="ui-action ui-action-tertiary" onclick={onOpenEdit}>
				{m.inventory_fix_button()}
			</button>
		{:else}
			<button type="button" class="ui-action ui-action-tertiary" onclick={onResolveReview}>
				{m.inventory_resolve_button()}
			</button>
		{/if}
	</div>
{/if}

<style>
	.stock-card-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.15rem 0.65rem;
		min-width: 0;
		margin-top: 0.2rem;
		color: color-mix(in oklab, var(--color-base-content) 68%, transparent);
		font-size: 0.7rem;
		line-height: 1.35;
	}

	.stock-signal,
	.stock-warning {
		color: var(--kitchen-honey-ink);
		font-weight: 760;
	}

	.stock-meta-link {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		border-radius: 0.4rem;
		color: var(--kitchen-olive);
		font-weight: 720;
		text-decoration: underline;
		text-decoration-style: dotted;
		text-underline-offset: 0.18rem;
	}

	.stock-meta-link:focus-visible {
		outline: 2px solid var(--kitchen-grove);
		outline-offset: 2px;
	}

	.stock-meta-link:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.stock-review-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.25rem;
		padding-top: 0.25rem;
		border-block-start: 1px solid color-mix(in oklab, var(--color-warning) 28%, var(--kitchen-line));
		color: var(--kitchen-honey-ink);
		font-size: 0.7rem;
	}

	.stock-review-copy {
		min-width: 0;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.stock-review-actions {
		display: inline-flex;
		flex: 0 0 auto;
		align-items: center;
		gap: 0.25rem;
	}

	.stock-review-row :global(.ui-action) {
		flex: 0 0 auto;
		padding-inline: 0.55rem;
	}
</style>
