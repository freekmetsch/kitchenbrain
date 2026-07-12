<!--
	Unit-aware quantity control (V2×V3 hybrid): countable units get the −/+
	stepper; measured units (g/kg/ml/l) get a tap-to-type field so you never tap
	"+100" five times. The page owns the tap-to-type editing state (one open
	editor at a time) and all writes; this component is display + intent only.
-->
<script module lang="ts">
	// Static per-component constants + pure helpers live in module scope so they
	// are allocated once, not once per rendered stock row.
	import { normalizeUnit } from '$lib/food_class';

	const MEASURED_UNITS = new Set(['g', 'kg', 'ml', 'l']);
	function isMeasured(unit: string | null): boolean {
		// Normalize first so 'gr'/'gram'/'liter'/'KG' etc. also read as measured, not just g/kg/ml/l.
		return !!unit && MEASURED_UNITS.has(normalizeUnit(unit));
	}
</script>

<script lang="ts">
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { autofocus, type Item } from './shared';

	let {
		item,
		editing,
		value = $bindable(),
		onStep,
		onCommit,
		onCancel,
		onOpenEdit,
		onOpenRowEdit
	}: {
		item: Item;
		editing: boolean;
		value: string;
		onStep: (delta: number) => void;
		onCommit: () => void;
		onCancel: () => void;
		onOpenEdit: () => void;
		onOpenRowEdit: () => void;
	} = $props();
</script>

{#if editing}
	<div class="flex shrink-0 items-center gap-1 rounded-lg border border-primary/40 bg-base-100 p-0.5 pl-2">
		<input
			type="number"
			inputmode="decimal"
			min="0"
			step="any"
			class="w-14 bg-transparent text-right text-sm tabular-nums outline-none"
			bind:value
			use:autofocus
			onkeydown={(e) => {
				if (e.key === 'Enter') onCommit();
				else if (e.key === 'Escape') onCancel();
			}}
			onblur={() => onCommit()}
			aria-label={`Quantity for ${item.name}`}
		/>
		<span class="pr-0.5 text-xs text-base-content/60">{item.unit ?? ''}</span>
		<button
			type="button"
			class="btn btn-primary btn-xs h-9 min-h-0 w-9 p-0"
			onmousedown={(e) => e.preventDefault()}
			onclick={() => onCommit()}
			aria-label="Save quantity"><Icon name="check" class="h-3.5 w-3.5" /></button
		>
	</div>
{:else if item.qtyNum === null}
	<button
		type="button"
		class="shrink-0 rounded-md px-2 py-1 text-xs text-base-content/60 hover:bg-base-200"
		onclick={() => onOpenRowEdit()}>{item.qtyText || 'set qty'}</button
	>
{:else if isMeasured(item.unit)}
	<button
		type="button"
		class="shrink-0 rounded-lg border border-base-300/70 bg-base-200/50 px-2.5 py-1 text-sm font-medium tabular-nums hover:border-primary/40 hover:bg-base-100"
		onclick={() => onOpenEdit()}
		aria-label={`Edit quantity for ${item.name}`}
	>
		{item.qtyNum}<span class="ml-0.5 text-xs font-normal text-base-content/60">{item.unit}</span>
	</button>
{:else}
	<div class="flex shrink-0 items-center gap-0.5 rounded-lg border border-base-300/60 bg-base-200/50 p-0.5">
		<button
			type="button"
			class="btn btn-ghost btn-sm h-9 min-h-0 w-9 p-0"
			aria-label={`Decrease ${item.name}`}
			disabled={(item.qtyNum ?? 0) <= 0}
			onclick={() => onStep(-1)}><Icon name="minus" class="h-3.5 w-3.5" /></button
		>
		<button
			type="button"
			class="min-w-8 px-1 text-center text-sm font-medium tabular-nums"
			onclick={() => onOpenEdit()}
			aria-label={`Edit quantity for ${item.name}`}
		>
			{item.qtyNum}<span class="text-xs font-normal text-base-content/60"
				>{item.unit && item.unit !== 'stuk' ? ' ' + item.unit : ''}</span
			>
		</button>
		<button
			type="button"
			class="btn btn-ghost btn-sm h-9 min-h-0 w-9 p-0"
			aria-label={`Increase ${item.name}`}
			onclick={() => onStep(1)}><Icon name="plus" class="h-3.5 w-3.5" /></button
		>
	</div>
{/if}
