<!--
	"Sent to AH" section — the week's recent pushes with per-item outcome lines
	(first five, then a "+N more" count). Renders nothing when the week has no
	push history.
-->
<script lang="ts">
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { APP_TIME_ZONE } from '$lib/week';

	// Row types derive from the shopping route's server load (via the generated
	// $types) so this stays in lock-step with the actual shape.
	import type { PageData } from '../../../routes/shopping/$types';

	type Push = PageData['pushHistory'][number];
	type PushHistoryItem = Push['items'][number];

	type Props = {
		pushHistory: Push[];
		compact?: boolean;
	};
	let { pushHistory, compact = false }: Props = $props();

	function formatPushTime(value: string | Date): string {
		return new Date(value).toLocaleString(getLocale() === 'nl' ? 'nl-NL' : 'en-GB', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit',
			timeZone: APP_TIME_ZONE
		});
	}

	function choiceLabel(item: PushHistoryItem): string {
		if (item.mode === 'product' && item.ahProductName) {
			return `${item.sourceName} → ${item.ahProductName}${item.quantity && item.quantity > 1 ? ` ×${item.quantity}` : ''}`;
		}
		if (item.mode === 'freetext') return m.shopping_pushhistory_as_text({ source: item.sourceName });
		return m.shopping_pushhistory_item_skipped({ source: item.sourceName });
	}
</script>

{#if pushHistory.length}
	<section class="push-history mt-4" class:compact>
		<h2 class="ui-section-label mb-2">{m.shopping_sent_to_ah_heading()}</h2>
		<div class="ui-list-card divide-y divide-base-200">
			{#each pushHistory as push}
				<article class="px-3 py-3">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="text-sm font-semibold {push.attemptStatus === 'uncertain' ? 'text-warning' : ''}">
								{#if push.attemptStatus === 'pending'}
									{m.shopping_pushhistory_pending_title()}
								{:else if push.attemptStatus === 'uncertain'}
									{m.shopping_pushhistory_uncertain_title()}
								{:else}{m.shopping_pushhistory_sent_count({
									count: push.productsPushed + push.freetextPushed,
									destination: push.destination === 'order' ? m.shopping_ah_destination_order() : m.shopping_ah_destination_list()
								})}{/if}
							</p>
							<p class="mt-0.5 text-xs text-base-content/45">
								{formatPushTime(push.createdAt)}{push.accountName ? ` · ${push.accountName}` : ''}
							</p>
						</div>
						{#if push.failedCount || push.skippedCount}
							<span class="ui-chip-muted shrink-0">
								{[
									push.failedCount ? m.shopping_pushhistory_failed_count({ count: push.failedCount }) : '',
									push.skippedCount ? m.shopping_pushhistory_skipped_count({ count: push.skippedCount }) : ''
								]
									.filter(Boolean)
									.join(' · ')}
							</span>
						{/if}
					</div>
					{#if push.attemptStatus === 'pending' || push.attemptStatus === 'uncertain'}
						<p class="mt-2 rounded-lg bg-warning/10 px-2.5 py-2 text-xs font-medium text-warning" role="alert">
							{push.attemptStatus === 'pending' ? m.shopping_pushhistory_pending_help() : m.shopping_pushhistory_uncertain_help()}
						</p>
					{/if}
					<ul class="mt-2 space-y-1 text-xs text-base-content/60">
						{#each push.items.slice(0, 5) as item}
							<li class="flex items-start gap-2">
								<Icon
									name={item.status === 'success' ? 'check' : item.status === 'failed' ? 'x' : item.status === 'uncertain' ? 'warn' : 'minus'}
									class="mt-0.5 h-3.5 w-3.5 shrink-0 {item.status === 'success'
										? 'text-success'
										: item.status === 'failed'
											? 'text-error'
											: item.status === 'uncertain'
												? 'text-warning'
												: 'text-base-content/35'}"
								/>
								<span class="min-w-0 flex-1 truncate">{choiceLabel(item)}{#if item.status === 'uncertain'} · {m.shopping_pushhistory_item_uncertain()}{/if}</span>
							</li>
						{/each}
						{#if push.items.length > 5}
							<li class="text-base-content/40">{m.shopping_pushhistory_more({ count: push.items.length - 5 })}</li>
						{/if}
					</ul>
				</article>
			{/each}
		</div>
	</section>
{/if}

<style>
	.push-history.compact {
		margin-top: 0.65rem;
	}

	.push-history.compact :global(.ui-list-card) {
		border-radius: 0.85rem;
		box-shadow: 0 6px 18px rgb(48 75 58 / 5%);
	}

	.push-history.compact :global(.ui-chip-muted) {
		min-height: 2rem;
	}
</style>
