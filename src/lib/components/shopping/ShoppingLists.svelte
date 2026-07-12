<!--
	The two check-off lists: "To buy" (with the in-stock reveal chip) and
	"In basket". Owns the crossfade pair so a checked row flies between the two
	sections. Item edits (toggle bought, delete manual) stay with the page via
	callbacks — this component only renders the rows.
-->
<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { flip } from 'svelte/animate';
	import { crossfade, fade, slide } from 'svelte/transition';
	import { itemLabel } from './format';
	import type { ShoppingListItem } from './types';

	// Check-off flies the row between "To buy" and "In basket"; adds/removes
	// without a counterpart fall back to a slide. Keyed by item name (unique
	// within a week's list).
	const [send, receive] = crossfade({
		duration: 200,
		fallback: (node) => slide(node, { duration: 150 })
	});

	type Props = {
		pending: ShoppingListItem[];
		done: ShoppingListItem[];
		coveredCount: number;
		visibleToBuyCount: number;
		showCovered: boolean;
		bonusByName: Record<string, boolean>;
		onToggleBought: (item: ShoppingListItem) => void;
		onDeleteManual: (item: ShoppingListItem) => void;
	};
	let {
		pending,
		done,
		coveredCount,
		visibleToBuyCount,
		showCovered = $bindable(),
		bonusByName,
		onToggleBought,
		onDeleteManual
	}: Props = $props();

	function itemDomId(section: string, index: number): string {
		return `${section}-${index}`;
	}
</script>

<section class="mb-4">
	<div class="mb-2 flex items-center justify-between gap-3">
		<h2 class="ui-section-label">To buy ({visibleToBuyCount})</h2>
		{#if coveredCount}
			<button
				type="button"
				class={showCovered ? 'ui-chip-active' : 'ui-chip'}
				aria-pressed={showCovered}
				onclick={() => (showCovered = !showCovered)}
			>
				{coveredCount} in stock
			</button>
		{/if}
	</div>

	{#if pending.length}
		<ul class="ui-list-card divide-y divide-base-200">
			{#each pending as item, index (item.name)}
				{@const rowId = itemDomId('pending', index)}
				<li
					class="flex min-h-14 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-base-200/60 {item.covered ? 'bg-base-200/30 text-base-content/55' : ''}"
					in:receive={{ key: item.name }}
					out:send={{ key: item.name }}
					animate:flip={{ duration: 200 }}
				>
					<input
						id={rowId}
						type="checkbox"
						class="checkbox checkbox-md shrink-0"
						checked={item.bought}
						aria-label={`Mark ${item.name} bought`}
						onchange={() => onToggleBought(item)}
					/>
					<label for={rowId} class="min-w-0 flex-1 cursor-pointer py-1">
						<span class="block text-sm font-medium leading-5">{item.name}</span>
						<span class="mt-1 flex flex-wrap items-center gap-1.5">
							{#if itemLabel(item)}
								<span class="text-xs text-base-content/50">{itemLabel(item)}</span>
							{/if}
							{#if bonusByName[item.name]}
								<span class="ui-chip-active border-error/40 bg-error/10 text-error">bonus</span>
							{/if}
							{#if item.covered}
								<span class="ui-chip-muted">in stock</span>
							{/if}
							{#if item.staple}
								<span class="ui-chip-muted text-warning">staple</span>
							{/if}
						</span>
					</label>
					{#if item.manual}
						<button
							type="button"
							class="btn btn-ghost btn-sm h-10 min-h-0 w-10 shrink-0 px-0"
							onclick={() => onDeleteManual(item)}
							aria-label={`Remove ${item.name}`}
						>
							<Icon name="x" />
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<div in:fade={{ duration: 150 }}>
			<EmptyState mini title={done.length ? 'All bought 🎉' : 'Stock covers everything'} />
		</div>
	{/if}
</section>

{#if done.length}
	<section class="mb-4">
		<h2 class="ui-section-label mb-2">In basket ({done.length})</h2>
		<ul class="ui-list-card divide-y divide-base-200">
			{#each done as item, index (item.name)}
				{@const rowId = itemDomId('done', index)}
				<li
					class="flex min-h-14 items-center gap-3 px-3 py-2.5 text-base-content/45"
					in:receive={{ key: item.name }}
					out:send={{ key: item.name }}
					animate:flip={{ duration: 200 }}
				>
					<input
						id={rowId}
						type="checkbox"
						class="checkbox checkbox-md shrink-0"
						checked={item.bought}
						aria-label={`Mark ${item.name} not bought`}
						onchange={() => onToggleBought(item)}
					/>
					<label for={rowId} class="min-w-0 flex-1 cursor-pointer py-1">
						<span class="block truncate text-sm font-medium line-through">{item.name}</span>
					</label>
				</li>
			{/each}
		</ul>
	</section>
{/if}
