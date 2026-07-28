<!-- Shopping utility band: one page identity plus week, delivery, AH, and rule context. -->
<script lang="ts">
	import { base } from '$app/paths';
	import KitchenPageHeader from '$lib/components/ui/KitchenPageHeader.svelte';
	import KitchenWeekNavigator from '$lib/components/ui/KitchenWeekNavigator.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
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
		recipeRuleCount?: number;
		excludedRuleCount?: number;
		onOpenRules?: () => void;
	};

	let {
		weekStart,
		prevWeek,
		nextWeek,
		isDefaultWeek,
		deliveryDate = null,
		ahConnected,
		recipeRuleCount = 0,
		excludedRuleCount = 0,
		onOpenRules
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

		{#if recipeRuleCount > 0}
			<button
				type="button"
				class="market-shopping-rules"
				aria-haspopup="dialog"
				onclick={onOpenRules}
			>
				<span>
					<strong>{m.shopping_rules_header()}</strong>
					<small>
						{excludedRuleCount
							? m.shopping_rules_off_list({ count: excludedRuleCount })
							: m.shopping_rules_review_summary()}
					</small>
				</span>
				<Icon name="chevronRight" />
			</button>
		{/if}
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

	.market-shopping-rules {
		display: flex;
		width: 100%;
		min-height: 2.75rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-top: 0.55rem;
		border: 1px solid rgb(255 255 255 / 17%);
		border-radius: 0.72rem;
		padding: 0.45rem 0.65rem 0.45rem 0.75rem;
		background: rgb(255 255 255 / 9%);
		color: white;
		text-align: left;
	}

	.market-shopping-rules:hover,
	.market-shopping-rules:focus-visible {
		background: rgb(255 255 255 / 14%);
	}

	.market-shopping-rules span {
		min-width: 0;
	}

	.market-shopping-rules strong,
	.market-shopping-rules small {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.market-shopping-rules strong {
		font-size: 0.68rem;
	}

	.market-shopping-rules small {
		margin-top: 0.05rem;
		color: #d5e0d8;
		font-size: 0.57rem;
	}

	.market-shopping-rules :global(svg) {
		width: 1rem;
		height: 1rem;
		flex: 0 0 auto;
	}

</style>
