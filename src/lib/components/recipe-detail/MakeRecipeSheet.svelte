<script lang="ts">
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { m } from '$lib/paraglide/messages';
	import { toast } from '$lib/stores/toast.svelte';
	import { untrack } from 'svelte';

	let {
		open = $bindable(false),
		recipeSlug,
		recipeTitle,
		baselineServings = 4,
		scalingMode = 'scalable',
		onAlreadyCooked
	}: {
		open?: boolean;
		recipeSlug: string;
		recipeTitle: string;
		baselineServings?: number;
		scalingMode?: 'scalable' | 'fixed_batch';
		onAlreadyCooked?: (servings: number) => void;
	} = $props();

	let servings = $state(untrack(() => baselineServings));
	let batchOverride = $state(false);
	let submitting = $state(false);

	$effect(() => {
		if (open) {
			servings = baselineServings;
			batchOverride = false;
		}
	});

	function startCooking() {
		open = false;
		void goto(`${base}/recipes/${recipeSlug}?cook=1&servings=${servings}`);
	}

	async function alreadyCooked() {
		if (submitting) return;
		submitting = true;
		try {
			const response = await fetch(`${base}/api/recipes/${recipeSlug}/cook`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ servings })
			});
			if (!response.ok) throw new Error();
			open = false;
			onAlreadyCooked?.(servings);
		} catch {
			toast.error(m.benchsheet_cook_failed());
		} finally {
			submitting = false;
		}
	}
</script>

<BottomSheet bind:open title={m.recipes_make_sheet_title()}>
	<p class="mb-4 text-sm text-base-content/65">{recipeTitle}</p>
	<div class="mb-4 rounded-xl border border-base-300 p-3">
		<div class="flex items-center justify-between gap-3">
			<div>
				<span class="text-[11px] font-semibold uppercase tracking-wide text-base-content/50">{m.recipes_addplan_servings_label()}</span>
				{#if scalingMode === 'fixed_batch' && !batchOverride}
					<p class="text-sm font-medium">{m.recipes_addplan_fixed_batch({ count: baselineServings })}</p>
				{/if}
			</div>
			{#if scalingMode === 'fixed_batch' && !batchOverride}
				<button type="button" class="btn btn-ghost btn-xs min-h-9" onclick={() => (batchOverride = true)}>{m.recipes_addplan_change_batch()}</button>
			{:else}
				<div class="flex items-center gap-2">
					<button type="button" class="btn btn-circle btn-sm btn-ghost border border-base-300" disabled={servings <= 1} onclick={() => (servings = Math.max(1, servings - 1))}>−</button>
					<span class="min-w-8 text-center text-lg font-bold tabular-nums">{servings}</span>
					<button type="button" class="btn btn-circle btn-sm btn-ghost border border-base-300" disabled={servings >= 99} onclick={() => (servings = Math.min(99, servings + 1))}>+</button>
				</div>
			{/if}
		</div>
	</div>
	<div class="grid grid-cols-2 gap-2">
		<button type="button" class="btn btn-primary btn-sm min-h-11" onclick={startCooking}>{m.recipes_make_start()}</button>
		<button type="button" class="btn btn-outline btn-sm min-h-11" disabled={submitting} onclick={alreadyCooked}>
			{#if submitting}<Spinner size="xs" />{/if}
			{m.recipes_make_already()}
		</button>
	</div>
</BottomSheet>
