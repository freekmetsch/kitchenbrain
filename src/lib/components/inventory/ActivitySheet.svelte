<!--
	Activity drawer (P2.3): page-wide recent inventory history with undo. The
	page owns loading + events (undo refreshes them) — this is the sheet shell.
-->
<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import HistoryList from './HistoryList.svelte';
	import type { HistoryEvent } from './shared';

	let {
		open = $bindable(false),
		loading,
		events,
		onUndo
	}: {
		open?: boolean;
		loading: boolean;
		events: HistoryEvent[];
		onUndo: (ev: HistoryEvent) => void;
	} = $props();
</script>

<BottomSheet bind:open title={m.inventory_activity_title()}>
	{#if loading}
		<p class="py-8 text-center text-sm text-base-content/50">{m.inventory_activity_loading()}</p>
	{:else if events.length === 0}
		<p class="py-8 text-center text-sm text-base-content/50">{m.inventory_activity_empty()}</p>
	{:else}
		<HistoryList {events} showName={true} {onUndo} />
	{/if}
</BottomSheet>
