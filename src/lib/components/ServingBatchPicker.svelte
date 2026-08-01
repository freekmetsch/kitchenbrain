<script lang="ts">
	import { BATCH_SERVING_MULTIPLIERS, batchServingMultiplier, batchServingTarget } from '$lib/meal_batch';
	import CompactPopover from '$lib/components/ui/CompactPopover.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';

	let {
		baselineServings,
		currentServings,
		ariaLabel,
		menuLabel,
		disabled = false,
		onselect
	}: {
		baselineServings: number | null;
		currentServings: number;
		ariaLabel: string;
		menuLabel: string;
		disabled?: boolean;
		onselect: (multiplier: number) => void;
	} = $props();

	let selected = $derived(batchServingMultiplier(baselineServings, currentServings));
	let options = $derived(
		BATCH_SERVING_MULTIPLIERS.map((multiplier) => ({
			value: multiplier,
			label: `×${multiplier}`,
			disabled: disabled || batchServingTarget(baselineServings, multiplier) == null
		}))
	);
</script>

<div class="serving-batch-picker">
	<div class="serving-batch-inline">
		<SegmentedControl
			{options}
			value={selected}
			ariaLabel={ariaLabel}
			onchange={onselect}
		/>
	</div>
	<div class="serving-batch-menu">
		<CompactPopover {ariaLabel} {disabled}>
			{#snippet trigger()}
				<span>{menuLabel}</span>
				{#if selected}<strong>×{selected}</strong>{/if}
			{/snippet}
			{#snippet children(close)}
				<SegmentedControl
					{options}
					value={selected}
					cols={2}
					ariaLabel={ariaLabel}
					onchange={(multiplier) => {
						onselect(multiplier);
						close();
					}}
				/>
			{/snippet}
		</CompactPopover>
	</div>
</div>

<style>
	.serving-batch-picker {
		container-type: inline-size;
		flex: 1 1 0;
		min-width: 7rem;
	}

	.serving-batch-menu {
		display: none;
	}

	@container (max-width: 13rem) {
		.serving-batch-inline {
			display: none;
		}

		.serving-batch-menu {
			display: block;
		}
	}
</style>
