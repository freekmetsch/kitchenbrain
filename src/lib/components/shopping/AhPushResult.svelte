<!--
	Push outcome view inside the AH sheet — success/partial banner, the
	moved-to-basket count, and the list of items that were not added.
-->
<script lang="ts">
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { fade } from 'svelte/transition';
	import type { AhPushOutcome } from './types';

	type Props = {
		result: AhPushOutcome;
		onClose: () => void;
	};
	let { result, onClose }: Props = $props();
</script>

<div
	class="rounded-2xl border {result.failed.length ? 'border-warning/30 bg-warning/10' : 'border-success/30 bg-success/10'} px-3 py-2"
	role="status"
	in:fade={{ duration: 150 }}
>
	<div class="flex gap-2">
		<Icon
			name={result.failed.length ? 'warn' : 'check'}
			class="mt-0.5 h-5 w-5 shrink-0 {result.failed.length ? 'text-warning' : 'text-success'}"
		/>
		<span>
			{result.pushed} {result.pushed === 1 ? 'item' : 'items'} added to
			{result.accountName ? `${result.accountName}'s` : 'the'} AH
			{result.destination === 'order' ? 'order' : 'shopping list'}.
		</span>
	</div>
</div>
{#if result.markedBought > 0}
	<p class="mt-3 text-sm text-base-content/60">
		{result.markedBought} moved to In basket.
	</p>
{/if}
{#if result.failed.length}
	<p class="mt-3 text-sm font-medium">Not added ({result.failed.length})</p>
	<ul class="mt-1 space-y-0.5 text-sm">
		{#each result.failed as f}
			<li class="flex gap-2 text-base-content/60">
				<span class="text-error">x</span>
				<span>{f.term}</span>
			</li>
		{/each}
	</ul>
	{#if result.reason}
		<p class="mt-2 text-xs text-base-content/50">{result.reason}</p>
	{/if}
{/if}
<div class="mt-4 flex justify-end gap-2">
	<a href="https://www.ah.nl" target="_blank" rel="noopener noreferrer" class="btn btn-outline">Open AH</a>
	<button type="button" class="btn" onclick={() => onClose()}>Close</button>
</div>
