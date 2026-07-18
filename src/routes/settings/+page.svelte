<script lang="ts">
	import { base } from '$app/paths';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { sortLabel, type SortBy } from '$lib/recipe_sort';
	import { weekdayName } from '$lib/weekday';
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let usernameInitial = $derived(data.username.trim().charAt(0).toLocaleUpperCase() || 'K');

	const panels = $derived([
		{
			href: 'display',
			title: m.settingsshell_panel_display(),
			summary: m.settingsshell_summary_theme({
				theme: data.theme === 'dark' ? m.settingsshell_theme_dark() : m.settingsshell_theme_light()
			})
		},
		{
			href: 'ai',
			title: m.settingsshell_panel_ai(),
			summary: m.settingsshell_summary_ai({
				model: data.chatModel,
				reasoning: data.reasoning === 'off' ? m.settingsshell_reasoning_fast() : m.settingsshell_reasoning_balanced(),
				spend: data.todaySpendEur.toFixed(3),
				cap: data.chatCapEur.toFixed(2)
			})
		},
		{
			href: 'meal-plan',
			title: m.settingsshell_panel_mealplan(),
			summary:
				data.mealPlanPrefs.groceryDay == null
					? m.settingsshell_summary_mealplan({ weekStart: weekdayName(data.mealPlanPrefs.weekStartDay) })
					: m.settingsshell_summary_mealplan_delivery({
							weekStart: weekdayName(data.mealPlanPrefs.weekStartDay),
							delivery: weekdayName(data.mealPlanPrefs.groceryDay)
						})
		},
		{
			href: 'recipes',
			title: m.settingsshell_panel_recipes(),
			summary: m.settingsshell_summary_recipes({
				lang: data.recipeLang === 'nl' ? m.recipes_edit_language_dutch() : m.recipes_edit_language_english(),
				sort: sortLabel(data.defaultSort as SortBy)
			})
		},
		{
			href: 'connections',
			title: m.settingsshell_panel_connections(),
			summary: data.ahConnected ? m.settingsshell_ah_connected() : m.settingsshell_ah_not_connected()
		},
		{ href: 'account', title: m.settingsshell_panel_account(), summary: data.username },
		{ href: 'data', title: m.settingsshell_panel_data(), summary: m.settingsshell_data_summary() },
		{ href: 'advanced', title: m.settingsshell_panel_advanced(), summary: m.settingsshell_advanced_summary() }
	]);
</script>

<svelte:head>
	<title>{m.settingsshell_title()}</title>
</svelte:head>

<div class="ui-page-shell px-4 pt-4">
	<header class="mb-5 flex items-center justify-between gap-3">
		<div>
			<p class="ui-section-label">{m.settingsshell_brand_label()}</p>
			<h1 class="text-2xl font-bold tracking-tight">{m.settingsshell_heading()}</h1>
		</div>
		<div class="avatar placeholder" aria-hidden="true">
			<div class="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-content">
				<span class="text-sm font-semibold">{usernameInitial}</span>
			</div>
		</div>
	</header>

	<div class="ui-list-card divide-y divide-base-200">
		{#each panels as panel (panel.href)}
			<a
				href="{base}/settings/{panel.href}"
				class="flex items-center justify-between gap-3 px-4 py-3.5 active:bg-base-200/50"
			>
				<div class="min-w-0">
					<p class="text-sm font-semibold">{panel.title}</p>
					<p class="truncate text-xs text-base-content/50">{panel.summary}</p>
				</div>
				<Icon name="chevronRight" class="h-4 w-4 shrink-0 text-base-content/30" />
			</a>
		{/each}
	</div>
</div>
