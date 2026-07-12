<!--
	Timeline list for inventory history events — used by the per-item history in
	the row editor and by the page-level activity drawer (P2.3).
-->
<script lang="ts">
	import { relativeTime } from '$lib/inventory_history';
	import type { HistoryEvent } from './shared';

	let {
		events,
		showName,
		onUndo
	}: {
		events: HistoryEvent[];
		showName: boolean;
		onUndo: (ev: HistoryEvent) => void;
	} = $props();
</script>

<ul class="space-y-1.5">
	{#each events as ev (ev.id)}
		<li class="flex items-start gap-2 text-xs leading-4">
			<span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full {ev.isUndo ? 'bg-info/60' : 'bg-base-content/25'}"></span>
			<div class="min-w-0 flex-1">
				<span class="text-base-content/70">
					{#if showName}<span class="font-medium text-base-content/80">{ev.itemName}</span> · {/if}{ev.summary}
				</span>
				<span class="text-base-content/55"> · {ev.actorLabel} · {relativeTime(ev.createdAt, Date.now())}</span>
			</div>
			{#if ev.undoable}
				<button type="button" class="shrink-0 font-medium text-primary/80 hover:text-primary" onclick={() => onUndo(ev)}>Undo</button>
			{/if}
		</li>
	{/each}
</ul>
