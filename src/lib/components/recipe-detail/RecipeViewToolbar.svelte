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

<div class="flex items-center justify-between gap-2 px-3 pt-2">
	<SegmentedTabs
		tabs={[
			{ value: 'cook', label: m.benchsheet_view_cooking() },
			{ value: 'original', label: m.benchsheet_view_original() }
		]}
		ariaLabel={m.benchsheet_view_label()}
		bind:value={view}
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
