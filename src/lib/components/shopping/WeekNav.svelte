<!-- Shopping utility band: one page identity plus week, delivery, and AH context. -->
<script lang="ts">
	import { base } from '$app/paths';
	import KitchenPageHeader from '$lib/components/ui/KitchenPageHeader.svelte';
	import KitchenWeekNavigator from '$lib/components/ui/KitchenWeekNavigator.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { addDays, APP_TIME_ZONE } from '$lib/week';

	type Props = {
		weekStart: string;
		prevWeek: string;
		nextWeek: string;
		isDefaultWeek: boolean;
		deliveryDate?: string | null;
		ahConnected: boolean;
		onAddItem: () => void;
	};

	let {
		weekStart,
		prevWeek,
		nextWeek,
		isDefaultWeek,
		deliveryDate = null,
		ahConnected,
		onAddItem
	}: Props = $props();

	function locale(): string {
		return getLocale() === 'nl' ? 'nl-NL' : 'en-GB';
	}

	function weekRangeLabel(iso: string): string {
		const format = (date: string) =>
			new Date(date + 'T00:00:00').toLocaleDateString(locale(), {
				weekday: 'short',
				day: 'numeric',
				month: 'short',
				timeZone: APP_TIME_ZONE
			});
		return `${format(iso)} – ${format(addDays(iso, 6))}`;
	}

	function deliveryLabel(iso: string): string {
		return new Date(iso + 'T00:00:00').toLocaleDateString(locale(), {
			weekday: 'long',
			day: 'numeric',
			month: 'short',
			timeZone: APP_TIME_ZONE
		});
	}
</script>

<KitchenPageHeader eyebrow={m.shopping_header_context()} title={m.shopping_heading()}>
	{#snippet action()}
		<button type="button" class="ui-action ui-action-primary" onclick={onAddItem}>
			<Icon name="plus" class="h-4 w-4" />
			{m.shopping_additem_submit_aria()}
		</button>
	{/snippet}
</KitchenPageHeader>

<div class="ui-page-utility">
	<div class="market-run-state ui-page-utility-inner">
	<div class="market-run-state">
		<KitchenWeekNavigator
			previousHref={`${base}/shopping?week=${prevWeek}`}
			nextHref={`${base}/shopping?week=${nextWeek}`}
			previousLabel={m.shopping_prev_week_aria()}
			nextLabel={m.shopping_next_week_aria()}
			ariaLabel={m.shopping_week_navigation_aria()}
		>
			<div class="market-week-copy">
				<strong>
					{#if isDefaultWeek}<span>{m.shopping_upcoming_shop_label()}</span><b aria-hidden="true"> · </b>{/if}
					{weekRangeLabel(weekStart)}
				</strong>
				<div>
					{#if deliveryDate}
						<span>{m.shopping_delivery_label({ date: deliveryLabel(deliveryDate) })}</span>
						<b aria-hidden="true"> · </b>
					{/if}
					<a href="{base}/meal-plan?week={weekStart}">{m.shopping_view_meal_plan_link()}</a>
				</div>
			</div>
		</KitchenWeekNavigator>
	</div>
		<StatusBadge tone={ahConnected ? 'success' : 'warning'}>
			<i aria-hidden="true"></i>
			{ahConnected ? m.shopping_ah_connected_short() : m.shopping_ah_offline_short()}
		</StatusBadge>
	</div>
</div>

<style>
	:global(.ui-status-badge) i {
		width: 0.4rem;
		height: 0.4rem;
		border-radius: 999px;
		background: #87cf98;
	}

	:global(.ui-status-badge[data-tone='warning']) i {
		background: #f0b34b;
	}

	.market-run-state {
		min-width: 0;
		width: 100%;
	}

	.ui-page-utility-inner.market-run-state {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.625rem;
	}

	.market-week-copy {
		min-width: 0;
	}

	.market-week-copy strong {
		display: block;
		overflow: hidden;
		font-size: 0.72rem;
		line-height: 1.25;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.market-week-copy strong span {
		color: var(--kitchen-honey-ink);
	}

	.market-week-copy div {
		overflow: hidden;
		margin-top: 0.1rem;
		color: var(--kitchen-muted);
		font-size: 0.58rem;
		line-height: 1.3;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.market-week-copy a {
		text-decoration: underline;
		text-decoration-color: color-mix(in oklab, currentColor 35%, transparent);
		text-underline-offset: 0.15rem;
	}

	.market-week-copy b {
		font-weight: 400;
		opacity: 0.5;
	}

</style>
