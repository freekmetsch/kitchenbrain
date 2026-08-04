<script lang="ts">
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
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
	const sourceOptions = $derived([
		...(frozenPortions > 0
			? [{ value: 'freezer' as const, label: m.meal_source_freezer_option({ count: frozenPortions }) }]
			: []),
		{
			value: 'fresh' as const,
			label:
				baselineServings == null
					? m.recipes_addplan_source_fresh()
					: m.meal_source_fresh_option({ count: baselineServings })
		}
	]);
</script>

<div>
	{#if source === null}
		<div class="flex flex-wrap gap-1.5" role="group" aria-label={m.meal_source_group_label()}>
			{#each sourceOptions as option}
				<button
					type="button"
					class="ui-action ui-action-secondary {compact ? '' : 'flex-1'}"
					{disabled}
					onclick={() => onselect(option.value)}
				>
					{option.label}
				</button>
			{/each}
		</div>
	{:else if sourceOptions.length > 1}
		<SegmentedControl
			options={sourceOptions.map((option) => ({ ...option, disabled }))}
			value={source}
			onchange={(nextSource) => onselect(nextSource)}
			cols={2}
			ariaLabel={m.meal_source_group_label()}
		/>
	{:else}
		<button
			type="button"
			class="ui-action ui-action-secondary"
			{disabled}
			onclick={() => onselect('fresh')}
		>
			{sourceOptions[0].label}
		</button>
	{/if}
	{#if shortfall > 0}
		<p class="mt-1.5 text-xs font-medium text-warning" role="status">
			{m.meal_source_shortfall({ count: shortfall })}
		</p>
	{/if}
</div>
