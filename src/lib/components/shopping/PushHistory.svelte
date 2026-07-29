<script lang="ts">
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import KitchenNotice from '$lib/components/ui/KitchenNotice.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import {
		orderShoppingPushItems,
		resolveShoppingPushOutcome,
		shoppingPushOutcomeNeedsReview,
		splitShoppingPushItems,
		type ShoppingPushOutcome
	} from '$lib/shopping_push_history';
	import { APP_TIME_ZONE } from '$lib/week';
	import type { PageData } from '../../../routes/shopping/$types';

	type Push = PageData['pushHistory'][number];
	type PushHistoryItem = Push['items'][number];

	type Props = {
		pushHistory: Push[];
		compact?: boolean;
		headingId?: string;
	};
	let {
		pushHistory,
		compact = false,
		headingId = 'push-history-heading'
	}: Props = $props();

	let latest = $derived(pushHistory[0]);
	let previous = $derived(pushHistory.slice(1));

	function formatPushTime(value: string | Date): string {
		return new Date(value).toLocaleString(getLocale() === 'nl' ? 'nl-NL' : 'en-GB', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit',
			timeZone: APP_TIME_ZONE
		});
	}

	function sentCount(push: Push): number {
		return push.productsPushed + push.freetextPushed;
	}

	function outcome(push: Push): ShoppingPushOutcome {
		return resolveShoppingPushOutcome({
			attemptStatus: push.attemptStatus,
			sentCount: sentCount(push),
			failedCount: push.failedCount,
			skippedCount: push.skippedCount
		});
	}

	function destinationLabel(push: Push): string {
		return push.destination === 'order'
			? m.shopping_ah_destination_order()
			: m.shopping_ah_destination_list();
	}

	function outcomeTitle(push: Push): string {
		switch (outcome(push)) {
			case 'pending':
				return m.shopping_pushhistory_pending_title();
			case 'uncertain':
				return m.shopping_pushhistory_uncertain_title();
			case 'failed':
				return m.shopping_pushhistory_failed_title();
			case 'partial':
				return m.shopping_pushhistory_partial_title({
					sent: sentCount(push),
					count: push.failedCount + push.skippedCount
				});
			case 'success':
				return m.shopping_pushhistory_sent_count({
					count: sentCount(push),
					destination: destinationLabel(push)
				});
		}
	}

	function choiceLabel(item: PushHistoryItem): string {
		if (item.mode === 'product' && item.ahProductName) {
			return `${item.sourceName} → ${item.ahProductName}${item.quantity && item.quantity > 1 ? ` ×${item.quantity}` : ''}`;
		}
		if (item.mode === 'freetext') return m.shopping_pushhistory_as_text({ source: item.sourceName });
		return m.shopping_pushhistory_item_skipped({ source: item.sourceName });
	}

	function orderedItems(push: Push): PushHistoryItem[] {
		return orderShoppingPushItems(push.items);
	}

	function iconName(item: PushHistoryItem): 'check' | 'x' | 'warn' | 'minus' {
		if (item.status === 'success') return 'check';
		if (item.status === 'failed') return 'x';
		if (item.status === 'uncertain') return 'warn';
		return 'minus';
	}

	function outcomeHelp(value: ShoppingPushOutcome): string | null {
		switch (value) {
			case 'pending':
				return m.shopping_pushhistory_pending_help();
			case 'uncertain':
				return m.shopping_pushhistory_uncertain_help();
			case 'failed':
				return m.shopping_pushhistory_failed_help();
			case 'partial':
				return m.shopping_pushhistory_partial_help();
			case 'success':
				return null;
		}
	}
</script>

{#snippet itemLines(items: PushHistoryItem[])}
	<ul class="push-item-list">
		{#each items as item}
			<li class:unresolved={item.status !== 'success'}>
				<Icon name={iconName(item)} />
				<span>{choiceLabel(item)}{#if item.status === 'uncertain'} · {m.shopping_pushhistory_item_uncertain()}{/if}</span>
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet attemptItems(push: Push, limit = 5)}
	{@const items = orderedItems(push)}
	{@render itemLines(items.slice(0, limit))}
	{#if items.length > limit}
		<p class="push-more">{m.shopping_pushhistory_more({ count: items.length - limit })}</p>
	{/if}
{/snippet}

{#if latest}
	{@const latestOutcome = outcome(latest)}
	{@const latestItems = splitShoppingPushItems(latest.items)}
	{@const latestHelp = outcomeHelp(latestOutcome)}
	<section class="push-history" class:compact aria-labelledby={headingId}>
		<h2 id={headingId} class="ui-section-title">{m.shopping_sent_to_ah_heading()}</h2>

		<article
			class="push-latest {latestOutcome}"
			aria-busy={latestOutcome === 'pending'}
			aria-live={latestOutcome === 'pending' ? 'polite' : undefined}
		>
			<header>
				<div class="push-status-icon">
					<Icon
						name={latestOutcome === 'success'
							? 'check'
							: latestOutcome === 'pending'
								? 'clock'
								: 'warn'}
					/>
				</div>
				<div class="push-title">
					<strong>{outcomeTitle(latest)}</strong>
					<span>{formatPushTime(latest.createdAt)}{latest.accountName ? ` · ${latest.accountName}` : ''}</span>
				</div>
				{#if latest.failedCount || latest.skippedCount}
					<span class="push-counts">
						{[
							latest.failedCount ? m.shopping_pushhistory_failed_count({ count: latest.failedCount }) : '',
							latest.skippedCount ? m.shopping_pushhistory_skipped_count({ count: latest.skippedCount }) : ''
						].filter(Boolean).join(' · ')}
					</span>
				{/if}
			</header>

			{#if latestHelp}
				<KitchenNotice tone="warning" class="mt-2 text-xs font-semibold" role="alert">
					{latestHelp}
				</KitchenNotice>
			{/if}

			{#if shoppingPushOutcomeNeedsReview(latestOutcome)}
				{#if latestItems.visible.length}
					{@render itemLines(latestItems.visible)}
				{/if}
				{#if latestItems.disclosed.length}
					<details class="push-details">
						<summary>{m.shopping_pushhistory_view_more_items({ count: latestItems.disclosed.length })}</summary>
						{@render itemLines(latestItems.disclosed)}
					</details>
				{/if}
			{:else if latestOutcome === 'success' && latest.items.length}
				<details class="push-details">
					<summary>{m.shopping_pushhistory_view_items({ count: latest.items.length })}</summary>
					{@render attemptItems(latest)}
				</details>
			{/if}

			{#if shoppingPushOutcomeNeedsReview(latestOutcome)}
				<a class="push-open-ah" href="https://www.ah.nl" target="_blank" rel="noopener noreferrer">
					{m.shopping_ah_open_button()}
				</a>
			{/if}
		</article>

		{#if previous.length}
			<details class="push-previous">
				<summary>{m.shopping_pushhistory_previous({ count: previous.length })}</summary>
				<div class="push-previous-list">
					{#each previous as push}
						<details class="push-previous-attempt">
							<summary>
								<span>
									<strong>{outcomeTitle(push)}</strong>
									<small>{formatPushTime(push.createdAt)}</small>
								</span>
								<Icon name="chevronRight" />
							</summary>
							{@render attemptItems(push)}
						</details>
					{/each}
				</div>
			</details>
		{/if}
	</section>
{/if}

<style>
	.push-history {
		margin: 0 0 0.6rem;
	}

	.push-history.compact {
		margin: 0.65rem 0 0;
	}

	.push-history > h2 {
		margin: 0 0 0.35rem;
	}

	.push-latest,
	.push-previous {
		border: 1px solid color-mix(in oklab, var(--color-base-content) 12%, var(--color-base-300));
		border-radius: 0.8rem;
		background: var(--color-base-100);
		box-shadow: 0 5px 16px rgb(48 75 58 / 4%);
	}

	.push-latest {
		padding: 0.7rem;
	}

	.push-latest.pending,
	.push-latest.uncertain {
		border-color: color-mix(in oklab, var(--color-warning) 38%, var(--color-base-300));
		background: color-mix(in oklab, var(--color-warning) 7%, var(--color-base-100));
	}

	.push-latest.failed {
		border-color: color-mix(in oklab, var(--color-error) 32%, var(--color-base-300));
	}

	.push-latest.partial {
		border-color: color-mix(in oklab, var(--market-terra, #a55f43) 36%, var(--color-base-300));
	}

	.push-latest > header {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.55rem;
	}

	.push-status-icon {
		display: grid;
		width: 1.9rem;
		height: 1.9rem;
		place-items: center;
		border-radius: 999px;
		background: color-mix(in oklab, var(--market-olive, #304b3a) 12%, var(--color-base-100));
		color: var(--market-olive-ink, #304b3a);
	}

	.pending .push-status-icon,
	.uncertain .push-status-icon {
		background: color-mix(in oklab, var(--color-warning) 17%, var(--color-base-100));
		color: var(--color-warning);
	}

	.failed .push-status-icon,
	.partial .push-status-icon {
		background: color-mix(in oklab, var(--market-terra, #a55f43) 14%, var(--color-base-100));
		color: var(--market-terra, #a55f43);
	}

	.push-status-icon :global(svg) {
		width: 1rem;
		height: 1rem;
	}

	.push-title {
		display: grid;
		min-width: 0;
		gap: 0.05rem;
	}

	.push-title strong {
		overflow: hidden;
		font-size: 0.72rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.push-title span,
	.push-previous-attempt small {
		color: color-mix(in oklab, var(--color-base-content) 52%, transparent);
		font-size: 0.62rem;
	}

	.push-counts {
		max-width: 7.5rem;
		color: color-mix(in oklab, var(--color-base-content) 58%, transparent);
		font-size: 0.6rem;
		font-weight: 750;
		text-align: right;
	}

	.push-item-list {
		display: grid;
		gap: 0.3rem;
		margin-top: 0.55rem;
	}

	.push-item-list li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: start;
		gap: 0.4rem;
		color: color-mix(in oklab, var(--color-base-content) 58%, transparent);
		font-size: 0.64rem;
		line-height: 1.35;
	}

	.push-item-list li.unresolved {
		color: color-mix(in oklab, var(--color-base-content) 80%, transparent);
		font-weight: 650;
	}

	.push-item-list :global(svg) {
		width: 0.8rem;
		height: 0.8rem;
		margin-top: 0.05rem;
	}

	.push-item-list li:not(.unresolved) :global(svg) {
		color: var(--color-success);
	}

	.push-more {
		display: block;
		margin: 0.25rem 0 0;
		padding-left: 1.2rem;
		color: color-mix(in oklab, var(--color-base-content) 45%, transparent);
		font-size: 0.64rem;
	}

	.push-details {
		margin-top: 0.45rem;
	}

	.push-details summary,
	.push-previous > summary {
		min-height: 2.75rem;
		cursor: pointer;
		color: var(--market-olive-ink, #304b3a);
		font-size: 0.66rem;
		font-weight: 800;
		list-style: none;
	}

	.push-details summary {
		display: inline-flex;
		align-items: center;
	}

	.push-details summary::-webkit-details-marker,
	.push-previous summary::-webkit-details-marker,
	.push-previous-attempt summary::-webkit-details-marker {
		display: none;
	}

	.push-open-ah {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		margin-top: 0.45rem;
		border-radius: 0.55rem;
		padding: 0 0.7rem;
		background: var(--market-olive, #304b3a);
		color: white;
		font-size: 0.67rem;
		font-weight: 800;
	}

	.push-previous {
		margin-top: 0.4rem;
	}

	.push-previous > summary {
		display: flex;
		align-items: center;
		padding: 0 0.7rem;
	}

	.push-previous-list {
		border-top: 1px solid var(--color-base-200);
	}

	.push-previous-attempt + .push-previous-attempt {
		border-top: 1px solid var(--color-base-200);
	}

	.push-previous-attempt {
		padding: 0 0.7rem 0.5rem;
	}

	.push-previous-attempt > summary {
		display: flex;
		min-height: 2.75rem;
		cursor: pointer;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		list-style: none;
	}

	.push-previous-attempt > summary span {
		display: grid;
		gap: 0.05rem;
	}

	.push-previous-attempt > summary strong {
		font-size: 0.66rem;
	}

	.push-previous-attempt > summary :global(svg) {
		width: 0.85rem;
		height: 0.85rem;
		transition: transform 120ms ease;
	}

	.push-previous-attempt[open] > summary :global(svg) {
		transform: rotate(90deg);
	}
</style>
