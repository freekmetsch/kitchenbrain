<script lang="ts">
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import FilterChip from '$lib/components/ui/FilterChip.svelte';
	import { frozenPortionShortfall, type MealSource } from '$lib/meal_source_choice';
	import { m } from '$lib/paraglide/messages';

	let {
		source = null,
		baselineServings,
		frozenPortions,
		servings,
		disabled = false,
		compact = false,
		onselect
	}: {
		source?: MealSource | null;
		baselineServings: number | null;
		frozenPortions: number;
		servings: number | null;
		disabled?: boolean;
		compact?: boolean;
		onselect: (source: MealSource) => void;
	} = $props();

	const shortfall = $derived(
		source === 'freezer' && servings != null
			? frozenPortionShortfall(servings, frozenPortions)
			: 0
	);
</script>

<div>
	<div
		class="flex flex-wrap gap-1.5"
		role="group"
		aria-label={m.meal_source_group_label()}
	>
		{#if frozenPortions > 0}
			<FilterChip
				class={compact ? '' : 'flex-1'}
				selected={source === 'freezer'}
				tone="info"
				disabled={disabled}
				onclick={() => onselect('freezer')}
			>
				<Icon name="snowflake" class="h-4 w-4" />
				{m.meal_source_freezer_option({ count: frozenPortions })}
			</FilterChip>
		{/if}
		<FilterChip
			class={compact ? '' : 'flex-1'}
			selected={source === 'fresh'}
			disabled={disabled}
			onclick={() => onselect('fresh')}
		>
			<Icon name="chefHat" class="h-4 w-4" />
			{baselineServings == null
				? m.recipes_addplan_source_fresh()
				: m.meal_source_fresh_option({ count: baselineServings })}
		</FilterChip>
	</div>
	{#if shortfall > 0}
		<p class="mt-1.5 text-xs font-medium text-warning" role="status">
			{m.meal_source_shortfall({ count: shortfall })}
		</p>
	{/if}
</div>
