<!-- Shopping utility band: one page identity plus week, delivery, AH, and progress context. -->
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
		isCurrentWeek: boolean;
		deliveryDate?: string | null;
		remainingCount: number;
		doneCount: number;
		totalCount: number;
		ahConnected: boolean;
	};

	let {
		weekStart,
		prevWeek,
		nextWeek,
		isCurrentWeek,
		deliveryDate = null,
		remainingCount,
		doneCount,
		totalCount,
		ahConnected
	}: Props = $props();

	let progress = $derived(totalCount > 0 ? Math.min(100, Math.round((doneCount / totalCount) * 100)) : 0);

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
					{#if isCurrentWeek}<span>{m.shopping_this_week_label()}</span><b aria-hidden="true"> · </b>{/if}
					{weekRangeLabel(weekStart)}
				</strong>
				<div>
					{#if deliveryDate}
						<span>{m.shopping_delivery_label({ date: deliveryLabel(deliveryDate) })}</span>
						<b aria-hidden="true"> · </b>
					{/if}
					<a href="{base}/meal-plan?week={weekStart}">{m.shopping_view_meal_plan_link()}</a>
					{#if !isCurrentWeek}
						<b aria-hidden="true"> · </b>
						<a href="{base}/shopping">{m.shopping_back_to_week_button()}</a>
					{/if}
				</div>
			</div>
		</KitchenWeekNavigator>

		<div
			class="market-progress"
			role="progressbar"
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow={progress}
			aria-label={`${m.shopping_items_left({ count: remainingCount })}; ${m.shopping_in_basket_short({ count: doneCount })}`}
		>
			<div class="market-progress-copy">
				<strong>{m.shopping_items_left({ count: remainingCount })}</strong>
				<span>{m.shopping_in_basket_short({ count: doneCount })}</span>
			</div>
			<div class="market-progress-track"><i style={`width: ${progress}%`}></i></div>
		</div>
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

	.market-progress {
		margin-top: 0.3rem;
	}

	.market-progress-copy {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.market-progress-copy strong {
		font-family: var(--kitchen-display);
		font-size: 1.05rem;
		font-weight: 500;
		line-height: 1;
	}

	.market-progress-copy span {
		color: #d7e0d9;
		font-size: 0.58rem;
	}

	.market-progress-track {
		height: 0.25rem;
		margin-top: 0.25rem;
		overflow: hidden;
		border-radius: 999px;
		background: rgb(255 255 255 / 18%);
	}

	.market-progress-track i {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: #f1c35f;
		transition: width var(--motion-content) var(--ease-standard);
	}

	@media (min-width: 48rem) {
		.market-run-state {
			display: grid;
			grid-template-columns: minmax(28rem, 1fr) minmax(13rem, 0.45fr);
			align-items: end;
			gap: 1.5rem;
		}

		.market-progress {
			margin-top: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.market-progress-track i {
			transition: none;
		}
	}
</style>
