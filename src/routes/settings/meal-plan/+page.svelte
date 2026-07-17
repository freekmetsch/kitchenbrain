<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import SegmentedTabs from '$lib/components/ui/SegmentedTabs.svelte';
	import SettingsPanelHeader from '$lib/components/settings/SettingsPanelHeader.svelte';
	import { optimistic } from '$lib/optimistic';
	import { m } from '$lib/paraglide/messages';
	import { toast } from '$lib/stores/toast.svelte';
	import { weekdayName, WEEKDAY_OFFSETS } from '$lib/weekday';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Patch = {
		weekStartDay?: number;
		groceryDay?: number | null;
		planAheadWeeks?: number;
		dayPlanning?: boolean;
		repeatCycleDays?: number;
		suggestCount?: number;
	};

	type OnOff = 'on' | 'off';
	const onOffTabs = [
		{ value: 'off', label: m.settings_common_off() },
		{ value: 'on', label: m.settings_common_on() }
	] satisfies { value: OnOff; label: string }[];

	const planAheadTabs = [2, 3, 4, 6].map((n) => ({ value: n, label: String(n) }));
	const repeatCycleTabs = [
		{ value: 0, label: m.settings_mealplan_cycle_off() },
		{ value: 7, label: m.settings_mealplan_cycle_weeks({ count: 1 }) },
		{ value: 14, label: m.settings_mealplan_cycle_weeks({ count: 2 }) },
		{ value: 28, label: m.settings_mealplan_cycle_weeks({ count: 4 }) }
	];
	const suggestCountTabs = [3, 5, 7].map((n) => ({ value: n, label: String(n) }));

	let weekStartDay = $state(untrack(() => data.prefs.weekStartDay));
	let groceryDay = $state<number | null>(untrack(() => data.prefs.groceryDay));
	let planAheadWeeks = $state(untrack(() => data.prefs.planAheadWeeks));
	let dayPlanning = $state<OnOff>(untrack(() => (data.prefs.dayPlanning ? 'on' : 'off')));
	let repeatCycleDays = $state(untrack(() => data.prefs.repeatCycleDays));
	let suggestCount = $state(untrack(() => data.prefs.suggestCount));
	let saving = $state(false);

	// Non-preset stored values (e.g. env-free defaults edited by hand) still need
	// a selectable segment — snap the tab row to the nearest preset for display.
	if (!planAheadTabs.some((t) => t.value === planAheadWeeks)) planAheadWeeks = 4;
	if (!repeatCycleTabs.some((t) => t.value === repeatCycleDays)) repeatCycleDays = 14;
	if (!suggestCountTabs.some((t) => t.value === suggestCount)) suggestCount = 5;

	async function save(patch: Patch) {
		const previous = { weekStartDay, groceryDay, planAheadWeeks, dayPlanning, repeatCycleDays, suggestCount };
		if (patch.weekStartDay !== undefined) weekStartDay = patch.weekStartDay;
		if (patch.groceryDay !== undefined) groceryDay = patch.groceryDay;
		if (patch.planAheadWeeks !== undefined) planAheadWeeks = patch.planAheadWeeks;
		if (patch.dayPlanning !== undefined) dayPlanning = patch.dayPlanning ? 'on' : 'off';
		if (patch.repeatCycleDays !== undefined) repeatCycleDays = patch.repeatCycleDays;
		if (patch.suggestCount !== undefined) suggestCount = patch.suggestCount;
		saving = true;
		const ok = await optimistic(
			() =>
				fetch(`${base}/api/settings/meal-plan`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(patch)
				}),
			() => {
				({ weekStartDay, groceryDay, planAheadWeeks, dayPlanning, repeatCycleDays, suggestCount } = previous);
			},
			m.settings_mealplan_save_failed()
		);
		saving = false;
		if (ok) {
			toast.success(m.settings_mealplan_saved());
			await invalidateAll();
		}
	}

	let weekEndDay = $derived((weekStartDay + 6) % 7);
</script>

<svelte:head>
	<title>{m.settings_mealplan_title()}</title>
</svelte:head>

<div class="ui-page-shell px-4 pt-4">
	<SettingsPanelHeader title={m.settingsshell_panel_mealplan()} />

	<div class="flex flex-col gap-5">
		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">{m.settings_mealplan_window_heading()}</h2>
			<div class="flex flex-col gap-4">
				<div>
					<label class="ui-field-label mb-1.5 block" for="week-start-day">{m.settings_mealplan_week_start_label()}</label>
					<select
						id="week-start-day"
						class="select select-bordered select-sm w-full"
						disabled={saving}
						value={weekStartDay}
						onchange={(e) => save({ weekStartDay: Number(e.currentTarget.value) })}
					>
						{#each WEEKDAY_OFFSETS as day}
							<option value={day}>{weekdayName(day)}</option>
						{/each}
					</select>
					<p class="mt-1.5 text-xs text-base-content/50">
						{m.settings_mealplan_week_start_hint({ from: weekdayName(weekStartDay), to: weekdayName(weekEndDay) })}
					</p>
				</div>
				<div class="border-t border-base-300 pt-3">
					<span class="ui-field-label mb-1.5 block" id="plan-ahead-label">{m.settings_mealplan_plan_ahead_label()}</span>
					<div class:pointer-events-none={saving} class:opacity-60={saving} aria-labelledby="plan-ahead-label">
						<SegmentedTabs tabs={planAheadTabs} value={planAheadWeeks} onchange={(v) => save({ planAheadWeeks: v })} />
					</div>
					<p class="mt-1.5 text-xs text-base-content/50">{m.settings_mealplan_plan_ahead_hint()}</p>
				</div>
			</div>
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">{m.settings_mealplan_delivery_heading()}</h2>
			<div>
				<label class="ui-field-label mb-1.5 block" for="grocery-day">{m.settings_mealplan_delivery_label()}</label>
				<select
					id="grocery-day"
					class="select select-bordered select-sm w-full"
					disabled={saving}
					value={groceryDay == null ? 'none' : String(groceryDay)}
					onchange={(e) => {
						const v = e.currentTarget.value;
						save({ groceryDay: v === 'none' ? null : Number(v) });
					}}
				>
					<option value="none">{m.settings_mealplan_delivery_none()}</option>
					{#each WEEKDAY_OFFSETS as day}
						<option value={String(day)}>{weekdayName(day)}</option>
					{/each}
				</select>
				<p class="mt-1.5 text-xs text-base-content/50">{m.settings_mealplan_delivery_hint()}</p>
			</div>
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">{m.settings_mealplan_day_planning_heading()}</h2>
			<div>
				<span class="ui-field-label mb-1.5 block" id="day-planning-label">{m.settings_mealplan_day_planning_label()}</span>
				<div class:pointer-events-none={saving} class:opacity-60={saving} aria-labelledby="day-planning-label">
					<SegmentedTabs tabs={onOffTabs} value={dayPlanning} onchange={(v) => save({ dayPlanning: v === 'on' })} />
				</div>
				<p class="mt-1.5 text-xs text-base-content/50">{m.settings_mealplan_day_planning_hint()}</p>
			</div>
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">{m.settings_mealplan_suggestions_heading()}</h2>
			<div class="flex flex-col gap-4">
				<div>
					<span class="ui-field-label mb-1.5 block" id="repeat-cycle-label">{m.settings_mealplan_repeat_cycle_label()}</span>
					<div class:pointer-events-none={saving} class:opacity-60={saving} aria-labelledby="repeat-cycle-label">
						<SegmentedTabs tabs={repeatCycleTabs} value={repeatCycleDays} onchange={(v) => save({ repeatCycleDays: v })} />
					</div>
					<p class="mt-1.5 text-xs text-base-content/50">{m.settings_mealplan_repeat_cycle_hint()}</p>
				</div>
				<div class="border-t border-base-300 pt-3">
					<span class="ui-field-label mb-1.5 block" id="suggest-count-label">{m.settings_mealplan_suggest_count_label()}</span>
					<div class:pointer-events-none={saving} class:opacity-60={saving} aria-labelledby="suggest-count-label">
						<SegmentedTabs tabs={suggestCountTabs} value={suggestCount} onchange={(v) => save({ suggestCount: v })} />
					</div>
					<p class="mt-1.5 text-xs text-base-content/50">{m.settings_mealplan_suggest_count_hint()}</p>
				</div>
			</div>
		</section>
	</div>
</div>
