<!-- Back-to-index + title header shared by every Settings drill-down panel. -->
<script lang="ts">
	import { base } from '$app/paths';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import KitchenPageHeader from '$lib/components/ui/KitchenPageHeader.svelte';
	import { m } from '$lib/paraglide/messages';

	let { title }: { title: string } = $props();
</script>

<div class="settings-panel-ribbon">
	<KitchenPageHeader eyebrow={m.settingsshell_heading()} {title}>
		{#snippet leading()}
			<a
				href="{base}/settings"
				class="ui-action ui-action-tertiary ui-action-on-dark ui-action-icon shrink-0"
				aria-label={m.settingsshell_back_aria()}><Icon name="chevronLeft" /></a
			>
		{/snippet}
	</KitchenPageHeader>
</div>

<style>
	.settings-panel-ribbon {
		position: relative;
		left: 50%;
		width: 100vw;
		margin-top: -1rem;
		margin-bottom: 1.25rem;
		margin-left: -50vw;
	}
</style>
