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
	import type { Week } from './types';

	let {
		open = $bindable(false),
		weeks,
		recipeSlug,
		dinnerTitle,
		frozenPortions = 0
	}: {
		open?: boolean;
		weeks: Week[];
		recipeSlug: string;
		dinnerTitle: string;
		/** Frozen portions on hand — offers the cook-fresh vs from-freezer choice when > 0. */
		frozenPortions?: number;
	} = $props();

	let addToPlanWeek = $state(untrack(() => weeks[0]?.weekStartDate ?? ''));
	let addToPlanSource = $state<'fresh' | 'freezer'>('fresh');
	let addToPlanSubmitting = $state(false);

	// Freezer portions on hand default the plan to serving from the freezer —
	// that's why the household stocked them. Re-evaluated each time the sheet opens.
	$effect(() => {
		if (open) addToPlanSource = frozenPortions > 0 ? 'freezer' : 'fresh';
	});

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
		<div class="mb-4 flex flex-col gap-1.5">
			<span class="text-[11px] font-semibold uppercase tracking-wide text-base-content/50"
				>{m.recipes_addplan_source_label()}</span
			>
			<label
				class="flex items-center gap-2.5 rounded-xl border px-3 py-2 cursor-pointer {addToPlanSource === 'freezer'
					? 'border-primary bg-primary/5'
					: 'border-base-300'}"
			>
				<input type="radio" class="radio radio-xs radio-primary" bind:group={addToPlanSource} value="freezer" />
				<span class="text-sm">❄️ {m.recipes_addplan_source_freezer({ count: frozenPortions })}</span>
			</label>
			<label
				class="flex items-center gap-2.5 rounded-xl border px-3 py-2 cursor-pointer {addToPlanSource === 'fresh'
					? 'border-primary bg-primary/5'
					: 'border-base-300'}"
			>
				<input type="radio" class="radio radio-xs radio-primary" bind:group={addToPlanSource} value="fresh" />
				<span class="text-sm">🍳 {m.recipes_addplan_source_fresh()}</span>
			</label>
		</div>
	{/if}
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
				<span class="text-sm">{week.label} — {m.recipes_addplan_week_label({ number: week.weekNumber })}</span>
			</label>
		{/each}
	</div>
	<div>
		<button
			class="btn btn-primary btn-sm w-full"
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
