<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import SegmentedTabs from '$lib/components/ui/SegmentedTabs.svelte';

	let {
		view = $bindable<'cook' | 'original'>(),
		language,
		languageSwitchable,
		onLanguageChange
	}: {
		view: 'cook' | 'original';
		language: 'en' | 'nl';
		languageSwitchable: boolean;
		onLanguageChange: (language: 'en' | 'nl') => void;
	} = $props();
</script>

<div class="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2">
	<SegmentedTabs
		tabs={[
			{ value: 'cook', label: m.benchsheet_view_cooking() },
			{ value: 'original', label: m.benchsheet_view_original() }
		]}
		value={view}
		ariaLabel={m.benchsheet_view_label()}
		onchange={(next) => (view = next)}
	/>
	{#if languageSwitchable}
		<SegmentedTabs
			tabs={[
				{ value: 'nl', label: 'NL' },
				{ value: 'en', label: 'EN' }
			]}
			value={language}
			ariaLabel={m.recipes_language_label()}
			onchange={onLanguageChange}
		/>
	{:else}
		<span class="inline-flex min-h-9 items-center px-2.5 text-xs font-semibold text-base-content/60">EN</span>
	{/if}
</div>
