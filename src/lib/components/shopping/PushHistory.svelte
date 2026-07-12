<!--
	"Sent to AH" section — the week's recent pushes with per-item outcome lines
	(first five, then a "+N more" count). Renders nothing when the week has no
	push history.
-->
<script lang="ts">
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { APP_TIME_ZONE } from '$lib/week';

	// Row types derive from the shopping route's server load (via the generated
	// $types) so this stays in lock-step with the actual shape.
	import type { PageData } from '../../../routes/shopping/$types';

	type Push = PageData['pushHistory'][number];
	type PushHistoryItem = Push['items'][number];

	type Props = {
		pushHistory: Push[];
	};
	let { pushHistory }: Props = $props();

	function formatPushTime(value: string | Date): string {
		return new Date(value).toLocaleString('en-GB', {
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
		if (item.mode === 'freetext') return `${item.sourceName} as text`;
		return `${item.sourceName} skipped`;
	}
</script>

{#if pushHistory.length}
	<section class="mt-4">
		<h2 class="ui-section-label mb-2">Sent to AH</h2>
		<div class="ui-list-card divide-y divide-base-200">
			{#each pushHistory as push}
				<article class="px-3 py-3">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="text-sm font-semibold">
								{push.productsPushed + push.freetextPushed} sent to {push.destination === 'order' ? 'order' : 'list'}
							</p>
							<p class="mt-0.5 text-xs text-base-content/45">
								{formatPushTime(push.createdAt)}{push.accountName ? ` · ${push.accountName}` : ''}
							</p>
						</div>
						{#if push.failedCount || push.skippedCount}
							<span class="ui-chip-muted shrink-0">
								{[
									push.failedCount ? `${push.failedCount} failed` : '',
									push.skippedCount ? `${push.skippedCount} skipped` : ''
								]
									.filter(Boolean)
									.join(' · ')}
							</span>
						{/if}
					</div>
					<ul class="mt-2 space-y-1 text-xs text-base-content/60">
						{#each push.items.slice(0, 5) as item}
							<li class="flex items-start gap-2">
								<Icon
									name={item.status === 'success' ? 'check' : item.status === 'failed' ? 'x' : 'minus'}
									class="mt-0.5 h-3.5 w-3.5 shrink-0 {item.status === 'success'
										? 'text-success'
										: item.status === 'failed'
											? 'text-error'
											: 'text-base-content/35'}"
								/>
								<span class="min-w-0 flex-1 truncate">{choiceLabel(item)}</span>
							</li>
						{/each}
						{#if push.items.length > 5}
							<li class="text-base-content/40">+{push.items.length - 5} more</li>
						{/if}
					</ul>
				</article>
			{/each}
		</div>
	</section>
{/if}
