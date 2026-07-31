<script lang="ts">
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import { formatDate } from '$lib/i18n';
	import { buildMealPlanPreview } from '$lib/meal_plan_preview';
	import { m } from '$lib/paraglide/messages';
	import { APP_TIME_ZONE, todayIso } from '$lib/week';
	import { weekdayName } from '$lib/weekday';

	let {
		weekStartDay,
		groceryDay,
		planAheadWeeks,
		dayPlanning,
		saving = false
	}: {
		weekStartDay: number;
		groceryDay: number | null;
		planAheadWeeks: number;
		dayPlanning: boolean;
		saving?: boolean;
	} = $props();

	const referenceDate = todayIso();
	const preview = $derived(
		buildMealPlanPreview(referenceDate, { weekStartDay, groceryDay })
	);

	function shortDate(iso: string): string {
		return formatDate(`${iso}T00:00:00Z`, {
			day: 'numeric',
			month: 'short',
			timeZone: APP_TIME_ZONE
		});
	}
</script>

<section class="ui-form-card border-primary/25 bg-primary/5" aria-busy={saving}>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h2 class="ui-section-title">{m.settings_mealplan_preview_heading()}</h2>
		<StatusBadge tone="info">
			{m.settings_mealplan_preview_weeks({ count: planAheadWeeks })}
		</StatusBadge>
	</div>

	<div class="mt-3 grid grid-cols-7 gap-1" aria-label={m.settings_mealplan_preview_week_label()}>
		{#each preview.days as day, index (day)}
			<div class="min-w-0 rounded-lg border border-base-300 bg-base-100 px-1 py-2 text-center">
				<span class="block truncate text-[10px] font-semibold uppercase tracking-wide text-base-content/50">
					{weekdayName((weekStartDay + index) % 7, 'short')}
				</span>
				<span class="block text-xs font-semibold tabular-nums">{day.slice(-2)}</span>
			</div>
		{/each}
	</div>

	<div class="mt-2 flex flex-wrap gap-1.5 text-xs">
		<StatusBadge>
			{shortDate(preview.weekStart)}–{shortDate(preview.weekEnd)}
		</StatusBadge>
		{#if preview.deliveryDate}
			<StatusBadge tone="success">
				<Icon name="cart" class="h-3.5 w-3.5" />
				{m.settings_mealplan_preview_delivery({ date: shortDate(preview.deliveryDate) })}
			</StatusBadge>
		{/if}
	</div>

	<div class="mt-3 rounded-xl border border-dashed border-base-300 bg-base-100 p-2.5">
		{#if dayPlanning}
			<div class="grid grid-cols-7 gap-1" aria-label={m.settings_mealplan_preview_by_day()}>
				{#each preview.days as day, index (day)}
					<div class="h-7 rounded-md bg-primary/15" title={weekdayName((weekStartDay + index) % 7)}></div>
				{/each}
			</div>
			<p class="mt-1.5 text-xs font-medium text-base-content/65">
				{m.settings_mealplan_preview_by_day()}
			</p>
		{:else}
			<div class="flex flex-wrap gap-1">
				{#each Array(Math.min(5, planAheadWeeks + 1)) as _}
					<span class="h-7 flex-1 rounded-md bg-primary/15"></span>
				{/each}
			</div>
			<p class="mt-1.5 text-xs font-medium text-base-content/65">
				{m.settings_mealplan_preview_pool()}
			</p>
		{/if}
	</div>
</section>
