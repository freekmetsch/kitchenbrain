<!--
	Push outcome view inside the AH sheet — success/partial banner, the
	moved-to-basket count, and the list of items that were not added.
-->
<script lang="ts">
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import KitchenNotice from '$lib/components/ui/KitchenNotice.svelte';
	import { m } from '$lib/paraglide/messages';
	import { fade } from 'svelte/transition';
	import type { AhPushOutcome } from './types';
	import { MOTION_MICRO_MS } from '$lib/motion';

	type Props = {
		result: AhPushOutcome;
		onClose: () => void;
	};
	let { result, onClose }: Props = $props();
</script>

<div in:fade={{ duration: MOTION_MICRO_MS }}>
	<KitchenNotice
		tone={result.uncertain || result.failed.length ? 'warning' : 'success'}
		role={result.uncertain ? 'alert' : 'status'}
	>
		<div class="flex gap-2.5">
			<Icon
				name={result.uncertain || result.failed.length ? 'warn' : 'check'}
				class="mt-0.5 h-5 w-5 shrink-0 {result.uncertain || result.failed.length ? 'text-warning' : 'text-success'}"
			/>
			<span class="text-sm leading-relaxed">
				{#if result.uncertain}
					<strong class="block">{m.shopping_ah_uncertain_heading()}</strong>
					{m.shopping_ah_uncertain_body()}
				{:else}
					{result.pushed === 1
						? m.shopping_ah_result_added_singular({
								count: result.pushed,
								account: result.accountName ? m.shopping_ah_account_named({ name: result.accountName }) : m.shopping_ah_account_default(),
								destination: result.destination === 'order' ? m.shopping_ah_destination_order() : m.shopping_ah_destination_list()
							})
						: m.shopping_ah_result_added_plural({
								count: result.pushed,
								account: result.accountName ? m.shopping_ah_account_named({ name: result.accountName }) : m.shopping_ah_account_default(),
								destination: result.destination === 'order' ? m.shopping_ah_destination_order() : m.shopping_ah_destination_list()
							})}
				{/if}
			</span>
		</div>
	</KitchenNotice>
</div>
{#if result.markedBought > 0}
	<p class="mt-3 text-sm text-base-content/60">
		{m.shopping_ah_marked_bought({ count: result.markedBought })}
	</p>
{:else if result.uncertain}
	<p class="mt-3 text-sm text-base-content/60">
		{m.shopping_ah_uncertain_none_marked()}
	</p>
{/if}
{#if result.failed.length}
	<p class="mt-3 text-sm font-medium">{m.shopping_ah_not_added_heading({ count: result.failed.length })}</p>
	<ul class="mt-1 space-y-0.5 text-sm">
		{#each result.failed as f}
			<li class="flex gap-2 text-base-content/60">
				<span class="text-error">x</span>
				<span>{f.term}</span>
			</li>
		{/each}
	</ul>
	{#if result.reason && !result.uncertain}
		<p class="mt-2 text-xs text-base-content/50">{result.reason}</p>
	{/if}
{/if}
<div class="mt-4 flex flex-wrap justify-end gap-2">
	<button type="button" class="ui-action ui-action-secondary" onclick={() => onClose()}>{m.ui_bottomsheet_close()}</button>
	<a href="https://www.ah.nl" target="_blank" rel="noopener noreferrer" class="ui-action ui-action-primary">{m.shopping_ah_open_button()}</a>
</div>
