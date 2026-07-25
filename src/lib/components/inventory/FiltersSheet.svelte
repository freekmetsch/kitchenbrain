<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { FOOD_CLASS_ROOTS } from '$lib/food_class';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import SegmentedTabs from '$lib/components/ui/SegmentedTabs.svelte';
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
			<SegmentedTabs tabs={sectionTabs} bind:value={sectionFilter} />
		</section>

		<section>
			<h3 class="ui-field-label mb-2">{m.inventory_filters_class_label()}</h3>
			<div class="flex flex-wrap gap-2">
				{#each FOOD_CLASS_ROOTS as foodClass (foodClass)}
					<button
						type="button"
						aria-pressed={classFilter === foodClass}
						class={classFilter === foodClass
							? 'ui-chip-active min-h-11'
							: 'ui-chip min-h-11'}
						onclick={() => (classFilter = classFilter === foodClass ? null : foodClass)}
					>
						{foodClassText(foodClass)}
					</button>
				{/each}
			</div>
		</section>

		{#if needsReviewCount > 0}
			<section>
				<button
					type="button"
					aria-pressed={reviewOnly}
					class="flex min-h-12 w-full items-center justify-between rounded-xl border px-3 text-left text-sm transition-colors {reviewOnly
						? 'border-warning/50 bg-warning/10 text-warning'
						: 'border-base-300 bg-base-100 text-base-content'}"
					onclick={() => (reviewOnly = !reviewOnly)}
				>
					<span class="inline-flex items-center gap-2 font-medium">
						<Icon name="warn" class="h-4 w-4" />
						{m.inventory_filters_review_label()}
					</span>
					<span class="tabular-nums">{needsReviewCount}</span>
				</button>
			</section>
		{/if}

		<div class="flex items-center justify-between gap-3 border-t border-base-200 pt-3">
			<button
				type="button"
				class="btn btn-ghost min-h-11"
				disabled={!hasFilters}
				onclick={clear}
			>
				{m.inventory_clear_filters_button()}
			</button>
			<button
				type="button"
				class="btn btn-primary min-h-11"
				onclick={() => (open = false)}
			>
				{m.inventory_filters_done()}
			</button>
		</div>
	</div>
</BottomSheet>
