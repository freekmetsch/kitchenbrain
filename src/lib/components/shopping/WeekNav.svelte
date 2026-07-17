<!--
	Sticky week switcher bar — previous/next week links plus the week label and
	the "Back to this week" shortcut. Week switches are same-route navigations;
	the page's `load` rerun carries all the state changes.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { APP_TIME_ZONE } from '$lib/week';

	type Props = {
		weekStart: string;
		prevWeek: string;
		nextWeek: string;
		isCurrentWeek: boolean;
		/** Grocery-delivery date within the shown week (Settings → Meal planning); null hides the line. */
		deliveryDate?: string | null;
	};
	let { weekStart, prevWeek, nextWeek, isCurrentWeek, deliveryDate = null }: Props = $props();

	function weekLabel(iso: string): string {
		const d = new Date(iso + 'T00:00:00');
		return d.toLocaleDateString(getLocale() === 'nl' ? 'nl-NL' : 'en-GB', {
			day: 'numeric',
			month: 'long',
			timeZone: APP_TIME_ZONE
		});
	}

	function deliveryLabel(iso: string): string {
		const d = new Date(iso + 'T00:00:00');
		return d.toLocaleDateString(getLocale() === 'nl' ? 'nl-NL' : 'en-GB', {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			timeZone: APP_TIME_ZONE
		});
	}
</script>

<div class="sticky top-0 z-20 -mx-4 mb-4 border-y border-base-200 bg-base-100/95 px-4 py-2 backdrop-blur">
	<div class="flex items-center justify-between gap-2">
		<a href="{base}/shopping?week={prevWeek}" class="btn btn-ghost btn-sm h-10 min-h-0 w-10 px-0" aria-label={m.shopping_prev_week_aria()}>
			<Icon name="chevronLeft" />
		</a>
		<div class="min-w-0 text-center">
			<div class="text-sm font-semibold">
				{isCurrentWeek ? m.shopping_this_week_label() : m.shopping_week_of_label()} {weekLabel(weekStart)}
			</div>
			{#if deliveryDate}
				<div class="text-xs text-base-content/50">{m.shopping_delivery_label({ date: deliveryLabel(deliveryDate) })}</div>
			{/if}
			<div class="flex items-center justify-center gap-2 text-xs">
				<!-- Same-week jump into the plan: shopping and meal plan stay glued
				     together per week instead of only linking plan → shopping. -->
				<a href="{base}/meal-plan?week={weekStart}" class="text-primary">{m.shopping_view_meal_plan_link()}</a>
				{#if !isCurrentWeek}
					<span class="text-base-content/30">·</span>
					<a href="{base}/shopping" class="text-primary">{m.shopping_back_to_week_button()}</a>
				{/if}
			</div>
		</div>
		<a href="{base}/shopping?week={nextWeek}" class="btn btn-ghost btn-sm h-10 min-h-0 w-10 px-0" aria-label={m.shopping_next_week_aria()}>
			<Icon name="chevronRight" />
		</a>
	</div>
</div>
