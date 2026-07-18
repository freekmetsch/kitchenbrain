<!--
	Sticky facet bar (P2.2) — one row, scrolls horizontally on 375px
	(UX-STOCK-11): section tabs, food-class root chips, needs-review toggle.
	Filter state is owned by the page and bound two-way.
-->
<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import SegmentedTabs from '$lib/components/ui/SegmentedTabs.svelte';
	import { FOOD_CLASS_ROOTS } from '$lib/food_class';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { foodClassText } from './shared';
	import type { Section } from './shared';
	import { scrollRail } from '$lib/actions/scroll_rail';

	let {
		sectionFilter = $bindable(),
		classFilter = $bindable(),
		reviewOnly = $bindable(),
		needsReviewCount
	}: {
		sectionFilter: Section | 'all';
		classFilter: string | null;
		reviewOnly: boolean;
		needsReviewCount: number;
	} = $props();

	const SECTION_TABS = $derived([
		{ value: 'all' as const, label: m.inventory_facet_all() },
		{ value: 'freezer' as const, label: m.inventory_section_freezer() },
		{ value: 'pantry' as const, label: m.inventory_section_pantry() }
	]);
</script>

<div class="sticky top-0 z-20 border-b border-base-300/60 bg-base-100/95 px-4 pb-2 pt-2 backdrop-blur">
	<div class="ui-scroll-rail flex items-center gap-1.5" use:scrollRail>
		<div class="shrink-0">
			<SegmentedTabs tabs={SECTION_TABS} bind:value={sectionFilter} />
		</div>
		{#each FOOD_CLASS_ROOTS as fc (fc)}
			<button
				type="button"
				aria-pressed={classFilter === fc}
				class={classFilter === fc ? 'ui-chip-active shrink-0' : 'ui-chip shrink-0'}
				onclick={() => (classFilter = classFilter === fc ? null : fc)}>{foodClassText(fc)}</button
			>
		{/each}
		{#if needsReviewCount > 0}
			<button
				type="button"
				aria-pressed={reviewOnly}
				class="{reviewOnly ? 'ui-chip-active border-warning/50 bg-warning/10 text-warning' : 'ui-chip'} shrink-0"
				onclick={() => (reviewOnly = !reviewOnly)}
			>
				<Icon name="warn" class="h-3 w-3" />
				{m.inventory_facet_review_count({ count: needsReviewCount })}
			</button>
		{/if}
	</div>
</div>
