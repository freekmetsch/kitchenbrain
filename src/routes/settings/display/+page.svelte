<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import SegmentedTabs from '$lib/components/ui/SegmentedTabs.svelte';
	import SettingsPanelHeader from '$lib/components/settings/SettingsPanelHeader.svelte';
	import { optimistic } from '$lib/optimistic';
	import { toast } from '$lib/stores/toast.svelte';
	import { untrack } from 'svelte';
	import { getLocale, setLocale, type Locale } from '$lib/paraglide/runtime';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Theme = 'light' | 'dark';

	const themeTabs = [
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	] satisfies { value: Theme; label: string }[];

	const languageTabs = [
		{ value: 'en', label: 'English' },
		{ value: 'nl', label: 'Nederlands' }
	] satisfies { value: Locale; label: string }[];

	let language = $state<Locale>(untrack(() => getLocale()));

	function setLanguage(next: Locale) {
		if (next === language) return;
		language = next;
		setLocale(next); // reloads the page to apply everywhere, incl. the AI chat's reply language
	}

	let theme = $state<Theme>(untrack(() => data.theme as Theme));
	let themeSaving = $state(false);

	async function setTheme(next: Theme) {
		if (themeSaving || next === theme) return;
		const previous = theme;
		theme = next;
		document.documentElement.setAttribute('data-theme', next);
		themeSaving = true;
		const ok = await optimistic(
			() =>
				fetch(`${base}/api/settings/theme`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ theme: next })
				}),
			() => {
				theme = previous;
				document.documentElement.setAttribute('data-theme', previous);
			},
			'Could not save the theme.'
		);
		themeSaving = false;
		if (ok) {
			toast.success('Saved theme');
			await invalidateAll();
		}
	}
</script>

<svelte:head>
	<title>Display - Settings</title>
</svelte:head>

<div class="ui-page-shell px-4 pt-4">
	<SettingsPanelHeader title="Display" />

	<section class="ui-form-card">
		<span class="ui-field-label mb-1.5 block" id="theme-label">Theme</span>
		<div class:pointer-events-none={themeSaving} class:opacity-60={themeSaving} aria-labelledby="theme-label">
			<SegmentedTabs tabs={themeTabs} value={theme} onchange={setTheme} />
		</div>
	</section>

	<section class="ui-form-card">
		<span class="ui-field-label mb-1.5 block" id="language-label">Language</span>
		<div aria-labelledby="language-label">
			<SegmentedTabs tabs={languageTabs} value={language} onchange={setLanguage} />
		</div>
	</section>
</div>
