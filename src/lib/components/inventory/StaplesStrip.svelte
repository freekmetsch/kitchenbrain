<!--
	Pantry staples strip (P4.4): one-tap push of a staple onto this week's
	shopping list, with per-session "✓ on list" confirmation (P6.5). The page
	owns the shopping POST (it's shared with the reached-zero toast action).
-->
<script lang="ts">
	import type { Item } from './shared';

	let {
		staples,
		added,
		busy,
		onAdd
	}: {
		staples: Item[];
		added: number[];
		busy: number | null;
		onAdd: (item: Item) => void;
	} = $props();
</script>

{#if staples.length > 0}
	<div class="mt-3 flex items-center gap-1.5 overflow-x-auto px-4 pb-0.5">
		<span class="ui-section-label shrink-0">Staples</span>
		{#each staples as staple (staple.id)}
			<span class="inline-flex shrink-0 items-center gap-1 rounded-full border border-base-300 bg-base-100 py-[3px] pl-2.5 pr-1 text-[11px]">
				<span class="max-w-36 truncate text-base-content/70">{staple.name}</span>
				{#if added.includes(staple.id)}
					<span class="shrink-0 rounded-full bg-success/15 px-1.5 font-medium text-success">✓ on list</span>
				{:else}
					<button
						type="button"
						class="shrink-0 rounded-full bg-base-200/70 px-1.5 font-medium text-base-content/60 hover:bg-base-200 hover:text-base-content disabled:opacity-50"
						disabled={busy === staple.id}
						aria-label={`Add ${staple.name} to this week's shopping list`}
						onclick={() => onAdd(staple)}>+ list</button
					>
				{/if}
			</span>
		{/each}
	</div>
{/if}
