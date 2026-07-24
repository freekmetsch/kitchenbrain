<script lang="ts">
	import Icon from '$lib/components/ui/icons/Icon.svelte';
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
			<button
				type="button"
				class={compact
					? `btn btn-xs min-h-9 ${source === 'freezer' ? 'btn-primary' : 'btn-ghost border border-base-300'}`
					: `flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${source === 'freezer' ? 'border-primary bg-primary/10 text-primary' : 'border-base-300'}`}
				aria-pressed={source === 'freezer'}
				disabled={disabled}
				onclick={() => onselect('freezer')}
			>
				<Icon name="snowflake" class="h-4 w-4" />
				{m.meal_source_freezer_option({ count: frozenPortions })}
			</button>
		{/if}
		<button
			type="button"
			class={compact
				? `btn btn-xs min-h-9 ${source === 'fresh' ? 'btn-primary' : 'btn-ghost border border-base-300'}`
				: `flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${source === 'fresh' ? 'border-primary bg-primary/10 text-primary' : 'border-base-300'}`}
			aria-pressed={source === 'fresh'}
			disabled={disabled}
			onclick={() => onselect('fresh')}
		>
			<Icon name="chefHat" class="h-4 w-4" />
			{baselineServings == null
				? m.recipes_addplan_source_fresh()
				: m.meal_source_fresh_option({ count: baselineServings })}
		</button>
	</div>
	{#if shortfall > 0}
		<p class="mt-1.5 text-xs font-medium text-warning" role="status">
			{m.meal_source_shortfall({ count: shortfall })}
		</p>
	{/if}
</div>
