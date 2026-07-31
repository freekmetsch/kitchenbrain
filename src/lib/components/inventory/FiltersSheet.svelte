<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { FOOD_CLASS_ROOTS } from '$lib/food_class';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import FilterChip from '$lib/components/ui/FilterChip.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { foodClassText, type Section } from './shared';

	let {
		open = $bindable(false),
		sectionFilter = $bindable(),
		classFilter = $bindable(),
		reviewOnly = $bindable(),
		needsReviewCount
	}: {
		open?: boolean;
		sectionFilter: Section | 'all';
		classFilter: string | null;
		reviewOnly: boolean;
		needsReviewCount: number;
	} = $props();

	const sectionTabs = $derived([
		{ value: 'all' as const, label: m.inventory_facet_all() },
		{ value: 'freezer' as const, label: m.inventory_section_freezer() },
		{ value: 'pantry' as const, label: m.inventory_section_pantry() }
	]);

	const hasFilters = $derived(
		sectionFilter !== 'all' || classFilter !== null || reviewOnly
	);

	function clear() {
		sectionFilter = 'all';
		classFilter = null;
		reviewOnly = false;
	}
</script>

<BottomSheet bind:open title={m.inventory_filters_title()} desktopCentered>
	<div class="space-y-5 pb-1">
		<section>
			<h3 class="ui-field-label mb-2">{m.inventory_filters_section_label()}</h3>
			<SegmentedControl options={sectionTabs} bind:value={sectionFilter} />
		</section>

		<section>
			<h3 class="ui-field-label mb-2">{m.inventory_filters_class_label()}</h3>
			<div class="flex flex-wrap gap-2">
				{#each FOOD_CLASS_ROOTS as foodClass (foodClass)}
					<FilterChip
						selected={classFilter === foodClass}
						onclick={() => (classFilter = classFilter === foodClass ? null : foodClass)}
					>
						{foodClassText(foodClass)}
					</FilterChip>
				{/each}
			</div>
		</section>

		{#if needsReviewCount > 0}
			<section>
				<FilterChip
					selected={reviewOnly}
					tone="warning"
					onclick={() => (reviewOnly = !reviewOnly)}
				>
					<Icon name="warn" class="h-4 w-4" />
					{m.inventory_filters_review_label()}
					<span class="tabular-nums">{needsReviewCount}</span>
				</FilterChip>
			</section>
		{/if}

		<div class="flex items-center justify-between gap-3 border-t border-base-200 pt-3">
			<button
				type="button"
				class="ui-action ui-action-tertiary"
				disabled={!hasFilters}
				onclick={clear}
			>
				{m.inventory_clear_filters_button()}
			</button>
			<button
				type="button"
				class="ui-action ui-action-primary"
				onclick={() => (open = false)}
			>
				{m.inventory_filters_done()}
			</button>
		</div>
	</div>
</BottomSheet>
