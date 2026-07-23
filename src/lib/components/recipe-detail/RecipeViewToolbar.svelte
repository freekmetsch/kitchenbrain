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
	<div class="flex min-h-9 items-center gap-1.5" aria-label={m.benchsheet_view_label()}>
		{#if view === 'cook'}
			<span class="px-2 text-sm font-semibold">{m.benchsheet_view_cooking()}</span>
			<button type="button" class="btn btn-ghost btn-xs min-h-9 text-base-content/55" onclick={() => (view = 'original')}>
				{m.benchsheet_view_original()}
			</button>
		{:else}
			<button type="button" class="btn btn-primary btn-xs min-h-9" onclick={() => (view = 'cook')}>
				{m.benchsheet_view_cooking()}
			</button>
			<span class="px-2 text-sm font-semibold">{m.benchsheet_view_original()}</span>
		{/if}
	</div>
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
