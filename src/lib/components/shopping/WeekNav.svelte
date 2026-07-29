<!-- Shopping utility band: one page identity plus week, delivery, and AH context. -->
<script lang="ts">
	import { base } from '$app/paths';
	import KitchenPageHeader from '$lib/components/ui/KitchenPageHeader.svelte';
	import KitchenWeekNavigator from '$lib/components/ui/KitchenWeekNavigator.svelte';
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
	};

	let {
		weekStart,
		prevWeek,
		nextWeek,
		isDefaultWeek,
		deliveryDate = null,
		ahConnected
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
	{#snippet actions()}
		<span class:offline={!ahConnected} class="market-ah-status">
			<i aria-hidden="true"></i>
			{ahConnected ? m.shopping_ah_connected_short() : m.shopping_ah_offline_short()}
		</span>
	{/snippet}

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
</KitchenPageHeader>

<style>
	.market-ah-status {
		display: inline-flex;
		min-height: 1.75rem;
		align-items: center;
		gap: 0.35rem;
		border: 1px solid rgb(255 255 255 / 20%);
		border-radius: 999px;
		padding: 0 0.55rem;
		background: rgb(255 255 255 / 8%);
		color: #edf3ee;
		font-size: 0.62rem;
		font-weight: 750;
		white-space: nowrap;
	}

	.market-ah-status i {
		width: 0.4rem;
		height: 0.4rem;
		border-radius: 999px;
		background: #87cf98;
	}

	.market-ah-status.offline {
		color: #ffdf9a;
	}

	.market-ah-status.offline i {
		background: #f0b34b;
	}

	.market-run-state {
		min-width: 0;
		width: 100%;
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
		color: #f5ce7a;
	}

	.market-week-copy div {
		overflow: hidden;
		margin-top: 0.1rem;
		color: #d3ded6;
		font-size: 0.58rem;
		line-height: 1.3;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.market-week-copy a {
		text-decoration: underline;
		text-decoration-color: rgb(255 255 255 / 30%);
		text-underline-offset: 0.15rem;
	}

	.market-week-copy b {
		font-weight: 400;
		opacity: 0.5;
	}

</style>
