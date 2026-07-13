<!-- Back-to-index + title header shared by every Settings drill-down panel. -->
<script lang="ts">
	import { base } from '$app/paths';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';

	let { title }: { title: string } = $props();
</script>

<header class="mb-5 flex items-center gap-2">
	<a
		href="{base}/settings"
		class="btn btn-ghost btn-sm h-9 min-h-0 w-9 shrink-0 p-0"
		aria-label={m.settingsshell_back_aria()}><Icon name="chevronLeft" /></a
	>
	<h1 class="text-xl font-bold tracking-tight">{title}</h1>
</header>
