<script lang="ts">
	import { base } from '$app/paths';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { SORT_LABELS, type SortBy } from '$lib/recipe_sort';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const panels = $derived([
		{
			href: 'display',
			title: 'Display',
			summary: `${data.theme === 'dark' ? 'Dark' : 'Light'} theme`
		},
		{
			href: 'ai',
			title: 'AI',
			summary: `${data.chatModel} · ${data.reasoning === 'off' ? 'Fast' : 'Balanced'} · EUR ${data.todaySpendEur.toFixed(3)} / ${data.chatCapEur.toFixed(2)} today`
		},
		{
			href: 'recipes',
			title: 'Recipes',
			summary: `${data.recipeLang === 'nl' ? 'Dutch' : 'English'} · sorted by ${SORT_LABELS[data.defaultSort as SortBy] ?? 'A-Z'}`
		},
		{
			href: 'connections',
			title: 'Connections',
			summary: data.ahConnected ? 'Albert Heijn connected' : 'Albert Heijn not connected'
		},
		{ href: 'account', title: 'Account', summary: data.username },
		{ href: 'data', title: 'Data', summary: 'Export your data as JSON' },
		{ href: 'advanced', title: 'Advanced', summary: 'Vision & background models, temperature' }
	]);
</script>

<svelte:head>
	<title>Settings - Household Brain</title>
</svelte:head>

<div class="ui-page-shell px-4 pt-4">
	<header class="mb-5 flex items-center justify-between gap-3">
		<div>
			<p class="ui-section-label">Household Brain</p>
			<h1 class="text-2xl font-bold tracking-tight">Settings</h1>
		</div>
		<div class="avatar placeholder">
			<div class="h-10 w-10 rounded-full bg-primary text-primary-content">
				<span class="text-sm font-semibold">{data.username[0].toUpperCase()}</span>
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
