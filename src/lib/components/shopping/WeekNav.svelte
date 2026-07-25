<!--
	The Market Run hero: page identity, AH connection state, week navigation,
	delivery context, and run progress in one compact source-aware surface.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
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

<header class="market-hero">
	<div class="market-hero-top">
		<p>{m.shopping_market_context()}</p>
		<span class:offline={!ahConnected} class="market-ah-status">
			<i aria-hidden="true"></i>
			{ahConnected ? m.shopping_ah_connected_short() : m.shopping_ah_offline_short()}
		</span>
	</div>

	<div class="market-hero-grid">
		<h1>{m.shopping_market_heading()}</h1>
		<div class="market-run-state">
			<div class="market-week-row">
				<a
					href="{base}/shopping?week={prevWeek}"
					class="market-week-button"
					aria-label={m.shopping_prev_week_aria()}
				>
					<Icon name="chevronLeft" />
				</a>
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
				<a
					href="{base}/shopping?week={nextWeek}"
					class="market-week-button"
					aria-label={m.shopping_next_week_aria()}
				>
					<Icon name="chevronRight" />
				</a>
			</div>

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
	</div>
</header>

<style>
	.market-hero {
		--market-olive: #304b3a;
		--market-olive-deep: #263e30;
		--market-olive-soft: #42624c;
		position: relative;
		overflow: hidden;
		color: white;
		background:
			radial-gradient(circle at 84% 2%, rgb(255 255 255 / 11%), transparent 13rem),
			linear-gradient(135deg, var(--market-olive-deep), var(--market-olive-soft));
	}

	.market-hero::after {
		position: absolute;
		right: -4rem;
		bottom: -6rem;
		width: 12rem;
		height: 12rem;
		border: 1px solid rgb(255 255 255 / 8%);
		border-radius: 999px;
		content: '';
		pointer-events: none;
	}

	.market-hero-top,
	.market-hero-grid {
		position: relative;
		z-index: 1;
		max-width: 74rem;
		margin: 0 auto;
	}

	.market-hero-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.6rem 0.75rem 0;
	}

	.market-hero-top p {
		color: #f2ca74;
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

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

	.market-hero-grid {
		display: grid;
		grid-template-columns: 5.75rem minmax(0, 1fr);
		align-items: end;
		gap: 0.5rem;
		padding: 0.15rem 0.75rem 0.65rem;
	}

	.market-hero h1 {
		margin: 0;
		font-family: Georgia, 'Times New Roman', serif;
		font-size: 1.65rem;
		font-weight: 500;
		line-height: 0.98;
		letter-spacing: -0.04em;
	}

	.market-run-state {
		min-width: 0;
	}

	.market-week-row {
		display: grid;
		grid-template-columns: 2.75rem minmax(0, 1fr) 2.75rem;
		align-items: center;
		gap: 0.45rem;
	}

	.market-week-button {
		display: inline-flex;
		width: 2.75rem;
		height: 2.75rem;
		align-items: center;
		justify-content: center;
		border: 1px solid rgb(255 255 255 / 23%);
		border-radius: 0.7rem;
		background: rgb(255 255 255 / 7%);
		color: white;
	}

	.market-week-button:hover,
	.market-week-button:focus-visible {
		background: rgb(255 255 255 / 15%);
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
		font-family: Georgia, 'Times New Roman', serif;
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
		.market-hero-top {
			padding: 0.85rem 1.5rem 0;
		}

		.market-hero-grid {
			grid-template-columns: minmax(13rem, 0.75fr) minmax(25rem, 1.25fr);
			gap: 2rem;
			padding: 0.25rem 1.5rem 1rem;
		}

		.market-hero h1 {
			font-size: 2.25rem;
		}

		.market-run-state {
			width: min(100%, 37.5rem);
			justify-self: end;
		}
	}

	@media (min-width: 64rem) {
		.market-hero-top {
			padding-inline: 2rem;
		}

		.market-hero-grid {
			padding-inline: 2rem;
		}

		.market-hero h1 {
			font-size: 2.5rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.market-progress-track i {
			transition: none;
		}
	}
</style>
