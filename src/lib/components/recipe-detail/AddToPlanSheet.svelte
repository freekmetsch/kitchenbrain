<!--
	"Add to meal plan" bottom sheet: pick a week, POST /api/meal-plan with the
	recipe as that week's dinner. `open` is bindable — the header's "+ Plan"
	button opens it from the parent; success and Cancel close it from here.
-->
<script lang="ts">
	import { base } from '$app/paths';
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
		dinnerTitle
	}: {
		open?: boolean;
		weeks: Week[];
		recipeSlug: string;
		dinnerTitle: string;
	} = $props();

	let addToPlanWeek = $state(untrack(() => weeks[0]?.weekStartDate ?? ''));
	let addToPlanSubmitting = $state(false);

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
					recipeSlug
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
	<div class="flex justify-end gap-2">
		<button
			class="btn btn-ghost btn-sm"
			onclick={() => {
				open = false;
			}}>{m.recipes_cancel_button()}</button
		>
		<button
			class="btn btn-primary btn-sm"
			onclick={addToPlan}
			disabled={addToPlanSubmitting}
		>
			{#if addToPlanSubmitting}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			{m.recipes_addplan_add_button()}
		</button>
	</div>
</BottomSheet>
