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
				toast.success('Added to meal plan');
				void invalidateAll();
			} else {
				const body = await res.json().catch(() => ({}));
				toast.error(body.message ?? `Could not add to meal plan (${res.status}).`);
			}
		} catch {
			toast.error('Could not add to meal plan.');
		}
		addToPlanSubmitting = false;
	}
</script>

<BottomSheet bind:open title="Add to meal plan">
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
				<span class="text-sm">{week.label} — Week {week.weekNumber}</span>
			</label>
		{/each}
	</div>
	<div class="flex justify-end gap-2">
		<button
			class="btn btn-ghost btn-sm"
			onclick={() => {
				open = false;
			}}>Cancel</button
		>
		<button
			class="btn btn-primary btn-sm"
			onclick={addToPlan}
			disabled={addToPlanSubmitting}
		>
			{#if addToPlanSubmitting}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			Add
		</button>
	</div>
</BottomSheet>
