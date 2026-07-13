<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import SegmentedTabs from '$lib/components/ui/SegmentedTabs.svelte';
	import SettingsPanelHeader from '$lib/components/settings/SettingsPanelHeader.svelte';
	import { optimistic } from '$lib/optimistic';
	import { toast } from '$lib/stores/toast.svelte';
	import { untrack } from 'svelte';
	import { getLocale, setLocale, type Locale } from '$lib/paraglide/runtime';
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Theme = 'light' | 'dark';

	const themeTabs = [
		{ value: 'light', label: m.settingsshell_theme_light() },
		{ value: 'dark', label: m.settingsshell_theme_dark() }
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
			m.settingsshell_toast_theme_save_failed()
		);
		themeSaving = false;
		if (ok) {
			toast.success(m.settingsshell_toast_theme_saved());
			await invalidateAll();
		}
	}
</script>

<svelte:head>
	<title>{m.settingsshell_panel_display()} - {m.settingsshell_page_suffix()}</title>
</svelte:head>

<div class="ui-page-shell px-4 pt-4">
	<SettingsPanelHeader title={m.settingsshell_panel_display()} />

	<section class="ui-form-card">
		<span class="ui-field-label mb-1.5 block" id="theme-label">{m.settingsshell_theme_label()}</span>
		<div class:pointer-events-none={themeSaving} class:opacity-60={themeSaving} aria-labelledby="theme-label">
			<SegmentedTabs tabs={themeTabs} value={theme} onchange={setTheme} />
		</div>
	</section>

	<section class="ui-form-card">
		<span class="ui-field-label mb-1.5 block" id="language-label">{m.settingsshell_language_label()}</span>
		<div aria-labelledby="language-label">
			<SegmentedTabs tabs={languageTabs} value={language} onchange={setLanguage} />
		</div>
	</section>
</div>
