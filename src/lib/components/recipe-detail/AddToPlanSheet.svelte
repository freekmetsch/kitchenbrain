<!--
	"Add to meal plan" bottom sheet: pick a week, POST /api/meal-plan with the
	recipe as that week's dinner. `open` is bindable — the header's "+ Plan"
	button opens it from the parent; success and Cancel close it from here.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';
	import MealSourceChoice from '$lib/components/meal-plan/MealSourceChoice.svelte';
	import {
		defaultServingsForMealSource,
		type MealSource
	} from '$lib/meal_source_choice';
	import type { Week } from './types';

	let {
		open = $bindable(false),
		weeks,
		recipeSlug,
		dinnerTitle,
		frozenPortions = 0,
		baselineServings = 4,
		scalingMode = 'scalable'
	}: {
		open?: boolean;
		weeks: Week[];
		recipeSlug: string;
		dinnerTitle: string;
		/** Frozen portions on hand — offers the cook-fresh vs from-freezer choice when > 0. */
		frozenPortions?: number;
		baselineServings?: number;
		scalingMode?: 'scalable' | 'fixed_batch';
	} = $props();

	let addToPlanWeek = $state(untrack(() => weeks[0]?.weekStartDate ?? ''));
	let addToPlanSource = $state<MealSource>('fresh');
	let addToPlanSubmitting = $state(false);
	let servings = $state(untrack(() => baselineServings));
	let batchOverride = $state(false);

	// Freezer portions on hand default the plan to serving from the freezer —
	// that's why the household stocked them. Re-evaluated each time the sheet opens.
	$effect(() => {
		if (open) {
			const defaultSource: MealSource = frozenPortions > 0 ? 'freezer' : 'fresh';
			addToPlanSource = defaultSource;
			servings = defaultServingsForMealSource(
				defaultSource,
				baselineServings,
				frozenPortions
			);
			batchOverride = false;
		}
	});

	function selectSource(source: MealSource) {
		addToPlanSource = source;
		servings = defaultServingsForMealSource(source, baselineServings, frozenPortions);
		batchOverride = false;
	}

	async function addToPlan() {
		if (addToPlanSubmitting) return;
		addToPlanSubmitting = true;
		try {
			const res = await fetch(`${base}/api/meal-plan`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					weekStartDate: addToPlanWeek,
					dinner: dinnerTitle,
					recipeSlug,
					servings,
					source: addToPlanSource
				})
			});
			if (res.ok) {
				open = false;
				toast.success(m.recipes_addplan_toast_added());
				void invalidateAll();
			} else {
				const body = await res.json().catch(() => ({}));
				toast.error(body.message ?? m.recipes_addplan_toast_failed({ status: res.status }));
			}
		} catch {
			toast.error(m.recipes_addplan_toast_failed_generic());
		}
		addToPlanSubmitting = false;
	}
</script>

<BottomSheet bind:open title={m.recipes_addplan_sheet_title()}>
	{#if frozenPortions > 0}
		<div class="mb-4">
			<span class="text-[11px] font-semibold uppercase tracking-wide text-base-content/50"
				>{m.recipes_addplan_source_label()}</span
			>
			<div class="mt-1.5">
				<MealSourceChoice
					source={addToPlanSource}
					{baselineServings}
					{frozenPortions}
					{servings}
					disabled={addToPlanSubmitting}
					onselect={selectSource}
				/>
			</div>
		</div>
	{/if}
	<div class="mb-4 rounded-xl border border-base-300 p-3">
		<div class="flex items-center justify-between gap-3">
			<div>
				<span class="text-[11px] font-semibold uppercase tracking-wide text-base-content/50">{m.recipes_addplan_servings_label()}</span>
				{#if scalingMode === 'fixed_batch' && addToPlanSource === 'fresh' && !batchOverride}
					<p class="text-sm font-medium">{m.recipes_addplan_fixed_batch({ count: baselineServings })}</p>
				{/if}
			</div>
			{#if scalingMode === 'fixed_batch' && addToPlanSource === 'fresh' && !batchOverride}
				<button type="button" class="ui-action ui-action-tertiary" onclick={() => (batchOverride = true)}>{m.recipes_addplan_change_batch()}</button>
			{:else}
				<div class="flex items-center gap-2">
					<button type="button" class="btn btn-circle btn-sm btn-ghost border border-base-300" disabled={servings <= 1} onclick={() => (servings = Math.max(1, servings - 1))}>−</button>
					<span class="min-w-8 text-center text-lg font-bold tabular-nums">{servings}</span>
					<button type="button" class="btn btn-circle btn-sm btn-ghost border border-base-300" disabled={servings >= 99} onclick={() => (servings = Math.min(99, servings + 1))}>+</button>
				</div>
			{/if}
		</div>
	</div>
	<div class="flex flex-col gap-2 mb-4">
		{#each weeks as week}
			<label
				class="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:bg-base-200 transition-colors"
			>
				<input
					type="radio"
					class="radio radio-sm radio-primary"
					bind:group={addToPlanWeek}
					value={week.weekStartDate}
				/>
				<span class="text-sm">{week.label} · {week.weekStartDate}–{week.weekEndDate}</span>
			</label>
		{/each}
	</div>
	<div>
		<button
			class="ui-action ui-action-primary w-full"
			onclick={addToPlan}
			disabled={addToPlanSubmitting}
		>
			{#if addToPlanSubmitting}
				<Spinner size="xs" />
			{/if}
			{m.recipes_addplan_add_button()}
		</button>
	</div>
</BottomSheet>
