<script lang="ts">
	import { base } from '$app/paths';
	import { untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import { slide } from 'svelte/transition';
	import { invalidateAll } from '$app/navigation';
	import ConsumePortionsModal from '$lib/components/ConsumePortionsModal.svelte';
	import FreezePortionsModal from '$lib/components/FreezePortionsModal.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import CompactPopover from '$lib/components/ui/CompactPopover.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import FilterChip from '$lib/components/ui/FilterChip.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import KitchenPageHeader from '$lib/components/ui/KitchenPageHeader.svelte';
	import KitchenWeekNavigator from '$lib/components/ui/KitchenWeekNavigator.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { APP_TIME_ZONE } from '$lib/week';
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';
	import { formatDate } from '$lib/i18n';
	import { MOTION_CONTENT_MS, MOTION_MICRO_MS } from '$lib/motion';
	import { batchServingMultiplier, batchServingTarget } from '$lib/meal_batch';
	import { mealPlanWeekHref } from '$lib/meal_plan_navigation';
	import MealSourceChoice from '$lib/components/meal-plan/MealSourceChoice.svelte';
	import { MealPlanController } from '$lib/components/meal-plan/controller.svelte';

	let { data }: { data: PageData } = $props();
	const controller = new MealPlanController(
		untrack(() => data),
		{ basePath: base }
	);
	$effect(() => {
		controller.syncData(data);
	});

	const DRAWER_CATEGORIES = ['meat', 'vegetarian', 'vegan', 'fish', 'pasta', 'soup', 'dessert'];

	function formatWeekRange(weekStartDate: string): string {
		const start = new Date(weekStartDate + 'T00:00:00');
		const end = new Date(weekStartDate + 'T00:00:00');
		end.setDate(end.getDate() + 6);
		const fmt = (d: Date) =>
			formatDate(d, { weekday: 'short', day: 'numeric', month: 'short', timeZone: APP_TIME_ZONE });
		return `${fmt(start)} - ${fmt(end)}`;
	}

	function cookedDateLabel(iso: string): string {
		return formatDate(iso + 'T00:00:00', {
			day: 'numeric',
			month: 'short',
			timeZone: APP_TIME_ZONE
		});
	}

	function deliveryLabel(iso: string): string {
		return formatDate(iso + 'T00:00:00', {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			timeZone: APP_TIME_ZONE
		});
	}

</script>

<svelte:head>
	<title>{m.mealplan_title()}</title>
</svelte:head>

<div class="meal-plan-page ui-grove-page">
	<p class="sr-only" aria-live="polite">{controller.servingsStatus}</p>
	<KitchenPageHeader eyebrow={m.mealplan_header_context()} title={m.mealplan_heading()}>
		{#snippet action()}
			{#if controller.selectedWeek}
				<button
					type="button"
					class="ui-action ui-action-primary"
					onclick={() => controller.openAddDrawer(controller.selectedWeek!.weekStartDate)}
				>
					<Icon name="plus" class="h-4 w-4" />
					{m.mealplan_add_meal()}
				</button>
			{/if}
		{/snippet}
	</KitchenPageHeader>

	{#if controller.selectedWeek}
		{@const week = controller.selectedWeek}
		<div class="ui-page-utility">
			<div class="plan-header-payload ui-page-utility-inner">
				<KitchenWeekNavigator
					previousHref={controller.adjacentWeeks.previous
						? mealPlanWeekHref(
								base,
								controller.adjacentWeeks.previous.weekStartDate,
								data.showPastWeeks
							)
						: null}
					nextHref={controller.adjacentWeeks.next
						? mealPlanWeekHref(base, controller.adjacentWeeks.next.weekStartDate, data.showPastWeeks)
						: null}
					previousLabel={m.mealplan_previous_week_aria()}
					nextLabel={m.mealplan_next_week_aria()}
					ariaLabel={m.mealplan_week_navigation_aria()}
				>
					<div class="plan-week-copy">
						<div class="flex items-center justify-center gap-2">
							<strong class="plan-week-title">
								{m.mealplan_week_heading({ number: week.weekNumber })}
							</strong>
							{#if week.weekStartDate === controller.currentWeekStart}
								<span class="plan-now">
									{m.mealplan_now_chip()}
								</span>
							{/if}
						</div>
						<p>{formatWeekRange(week.weekStartDate)}</p>
						{#if week.deliveryDate}
							<p class="plan-delivery">
								<Icon name="cart" class="h-3 w-3" />
								{m.mealplan_delivery_label({ date: deliveryLabel(week.deliveryDate) })}
							</p>
						{/if}
					</div>
				</KitchenWeekNavigator>

				<div class="plan-actions">
					<a
						href="{base}/shopping?week={week.weekStartDate}"
						class="ui-action ui-action-secondary"
					>
						<Icon name="cart" class="h-4 w-4" />
						{m.mealplan_shopping_link()}
					</a>
					<details class="dropdown dropdown-end">
						<summary
							class="plan-more ui-action ui-action-tertiary ui-action-icon"
							aria-label={m.mealplan_more_options_aria()}
						>
							<span aria-hidden="true">⋯</span>
						</summary>
						<ul
							class="menu dropdown-content right-0 z-30 mt-2 w-56 rounded-box border border-base-300 bg-base-100 p-2 text-base-content shadow-lg"
						>
							{#if data.hasPastWeeks || data.showPastWeeks}
								<li>
									<a
										href={mealPlanWeekHref(
											base,
											controller.selectedWeek.weekStartDate,
											!data.showPastWeeks
										)}
									>
										<Icon name="clock" class="h-4 w-4" />
										{data.showPastWeeks
											? m.mealplan_hide_past_weeks()
											: m.mealplan_show_past_weeks()}
									</a>
								</li>
							{/if}
							<li>
								<a href="{base}/settings/meal-plan">
									<Icon name="settings" class="h-4 w-4" />
									{m.mealplan_settings_aria()}
								</a>
							</li>
						</ul>
					</details>
				</div>
			</div>
		</div>
	{/if}

	<main class="plan-ledger ui-grove-surface ui-kitchen-content">
		{#if controller.selectedWeek}
			{@const week = controller.selectedWeek}
		<div>
			<section
				id="week-{week.weekStartDate}"
				class="plan-meal-board {week.weekStartDate === controller.currentWeekStart ? 'plan-current-week' : ''}"
			>
				{#if week.meals.length > 0}
					<ul class="plan-meal-list">
						{#each controller.displayMeals(week) as meal (meal.id)}
							{@const linkedRecipe = controller.recipeForMeal(meal)}
							<li
								class="meal-row"
								transition:slide={{ duration: MOTION_MICRO_MS }}
								animate:flip={{ duration: MOTION_CONTENT_MS }}
							>
								<label class="meal-check">
									<input
										type="checkbox"
										class="checkbox checkbox-md"
										checked={meal.status === 'cooked'}
										disabled={!!controller.pendingToggles[meal.id]}
										aria-label={m.mealplan_mark_cooked_aria({ dinner: meal.dinner })}
										onchange={() => controller.toggleCooked(meal)}
									/>
								</label>
								{#if meal.recipeSlug}
									<a
										href="{base}/recipes/{meal.recipeSlug}?plan={meal.id}{meal.servings ? `&servings=${meal.servings}` : ''}"
										class="meal-title {meal.status === 'cooked' ? 'text-base-content/40 line-through' : ''}"
									>
										{meal.dinner}
									</a>
								{:else}
									<span class="meal-title {meal.status === 'cooked' ? 'text-base-content/40 line-through' : ''}">
										{meal.dinner}
									</span>
								{/if}
								<button
									type="button"
									class="meal-remove ui-action ui-action-tertiary ui-action-icon"
									onclick={() => controller.removeMeal(meal)}
									disabled={!!controller.pendingDeletes[meal.id]}
									aria-label={m.mealplan_remove_meal_aria({ dinner: meal.dinner })}
								>
									<Icon name="trash" />
								</button>
								<div class="meal-details">
									{#if controller.dayPlanning && meal.status !== 'cooked'}
										<select
											class="ui-field w-24 {meal.plannedDate ? '' : 'text-base-content/40'}"
											value={meal.plannedDate ?? ''}
											disabled={!!controller.pendingToggles[meal.id] || meal.id < 0}
											aria-label={m.mealplan_day_picker_aria({ dinner: meal.dinner })}
											onchange={(e) => controller.setPlannedDate(meal, e.currentTarget.value || null)}
										>
											<option value="">{m.mealplan_day_unplanned()}</option>
											{#each controller.weekDayOptions(week.weekStartDate) as day (day.date)}
												<option value={day.date}>{day.label}</option>
											{/each}
										</select>
									{/if}
									{#if meal.status !== 'cooked' && meal.recipeSlug && meal.servings}
										<div class="meal-portion-row">
											<div class="meal-serving-stepper inline-flex items-center rounded-lg border border-base-300" aria-label={m.mealplan_servings_label()} aria-busy={!!controller.pendingServings[meal.id]}>
												<button type="button" class="btn btn-ghost btn-xs h-11 min-h-0 rounded-r-none" disabled={meal.servings <= 1} aria-disabled={!!controller.pendingServings[meal.id] || meal.servings <= 1} aria-label={m.mealplan_decrease_servings_aria({ dinner: meal.dinner })} onclick={() => !controller.pendingServings[meal.id] && controller.changeServings(meal, -1)}>−</button>
												<span class="min-w-0 flex-1 px-1 text-center text-xs tabular-nums">{m.mealplan_servings_count({ count: meal.servings })}</span>
												<button type="button" class="btn btn-ghost btn-xs h-11 min-h-0 rounded-l-none" disabled={meal.servings >= 99} aria-disabled={!!controller.pendingServings[meal.id] || meal.servings >= 99} aria-label={m.mealplan_increase_servings_aria({ dinner: meal.dinner })} onclick={() => !controller.pendingServings[meal.id] && controller.changeServings(meal, 1)}>+</button>
											</div>
											{#if linkedRecipe && meal.source !== 'freezer'}
												{@const selectedBatch = batchServingMultiplier(linkedRecipe.servings, meal.servings)}
												<CompactPopover
													disabled={!!controller.pendingServings[meal.id]}
													ariaLabel={m.mealplan_batch_size_aria({ dinner: meal.dinner })}
												>
													{#snippet trigger()}
														<span>{m.mealplan_batch_size_button()}</span>
														{#if selectedBatch}
															<strong>×{selectedBatch}</strong>
														{/if}
													{/snippet}
													{#snippet children(close)}
														<SegmentedControl
															options={[1, 2, 3, 4].map((multiplier) => ({
																value: multiplier,
																label: `×${multiplier}`,
																disabled: batchServingTarget(linkedRecipe.servings, multiplier) == null
															}))}
															value={selectedBatch}
															cols={2}
															ariaLabel={linkedRecipe.scalingMode === 'fixed_batch'
																? m.mealplan_batch_fixed()
																: m.mealplan_batch_scalable()}
															onchange={(multiplier) => {
																const target = batchServingTarget(linkedRecipe.servings, multiplier);
																if (target != null && !controller.pendingServings[meal.id]) {
																	controller.setServings(meal, target);
																	close();
																}
															}}
														/>
													{/snippet}
												</CompactPopover>
											{/if}
										</div>
									{/if}
									{#if meal.cookedDate && meal.status === 'cooked'}
										<span class="inline-flex items-center gap-1 text-xs text-base-content/35">
											<Icon name="check" class="h-3 w-3" />
											{cookedDateLabel(meal.cookedDate)}
										</span>
									{/if}
									{#if meal.status !== 'cooked' && meal.recipeSlug && (meal.source === 'freezer' || controller.frozenPortionsFor(meal) > 0)}
										{@const onHand = controller.frozenPortionsFor(meal)}
										{@const linkedForSource = controller.recipeForMeal(meal)}
										{#if linkedForSource && meal.servings}
											<div class="meal-source-row">
												<MealSourceChoice
													source={meal.source}
													baselineServings={linkedForSource.servings}
													frozenPortions={onHand}
													servings={meal.servings}
													compact
													disabled={!!controller.pendingSourceToggles[meal.id] || meal.id < 0}
													onselect={(source) => controller.setMealSource(meal, source)}
												/>
											</div>
										{/if}
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<div class="p-3">
						<EmptyState mini title={m.mealplan_no_meals_title()} />
					</div>
				{/if}

				{#if week}
					{@const shortlist = controller.rotationShortlistFor(week.weekStartDate)}
				{#if shortlist.due.length > 0 || shortlist.freezerLow.length > 0}
					<aside class="rotation-ledger" aria-labelledby="rotation-ledger-{week.weekStartDate}">
						<h2 id="rotation-ledger-{week.weekStartDate}" class="ui-section-title">
							{m.mealplan_rotation_heading()}
						</h2>
						{#each [
							{ kind: 'due', rows: shortlist.due, heading: m.mealplan_rotation_due_heading(), description: m.mealplan_rotation_due_desc() },
							{ kind: 'freezerLow', rows: shortlist.freezerLow, heading: m.mealplan_rotation_low_heading(), description: m.mealplan_rotation_low_desc() }
						] as lane}
							{#if lane.rows.length > 0}
								<section class="rotation-lane">
									<div>
										<h3>{lane.heading}</h3>
										<p>{lane.description}</p>
									</div>
									<ul>
										{#each lane.rows as candidate (candidate.key)}
											<li class="rotation-row">
												<div class="min-w-0">
											<strong>{candidate.titleEn ?? candidate.title}</strong>
											<p>
													{lane.kind === 'freezerLow' && candidate.targetPortions !== null
															? m.mealplan_rotation_stock_reason({ onHand: candidate.onHandPortions, target: candidate.targetPortions })
															: m.mealplan_rotation_due_reason()}
													</p>
												</div>
												<button
													type="button"
													class="ui-action {candidate.action === 'cook' ? 'ui-action-primary' : 'ui-action-secondary'}"
													disabled={!!controller.pendingRotation[candidate.key]}
													onclick={() => controller.planRotationCandidate(week.weekStartDate, candidate)}
												>
													{candidate.action === 'cook'
														? m.mealplan_rotation_cook()
														: m.mealplan_rotation_use_freezer()}
												</button>
											</li>
										{/each}
									</ul>
								</section>
							{/if}
						{/each}
					</aside>
				{/if}
				{/if}
			</section>
		</div>
		{/if}
	</main>
</div>

<style>
	.meal-plan-page {
		min-height: 100%;
		background: var(--kitchen-grove);
	}

	.plan-more {
		list-style: none;
		padding-bottom: 0.2rem;
		font-size: 1.45rem;
		line-height: 1;
		letter-spacing: 0;
	}

	.plan-more::marker,
	.plan-more::-webkit-details-marker {
		display: none;
		content: '';
	}

	.plan-more + .menu a {
		min-height: 2.75rem;
	}

	.plan-header-payload {
		display: grid;
		gap: 0.55rem;
	}

	.plan-week-copy {
		min-width: 0;
		text-align: center;
	}

	.plan-week-title {
		font-size: 0.8rem;
		font-weight: 800;
		line-height: 1.2;
	}

	.plan-week-copy > p {
		margin-top: 0.18rem;
		color: var(--kitchen-muted);
		font-size: 0.68rem;
	}

	.plan-week-copy .plan-delivery {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
	}

	.plan-now {
		display: inline-flex;
		min-height: 1.65rem;
		align-items: center;
		border: 1px solid color-mix(in oklab, var(--kitchen-honey) 62%, var(--kitchen-line));
		border-radius: 999px;
		padding: 0 0.5rem;
		background: color-mix(in oklab, var(--kitchen-honey) 14%, var(--kitchen-card));
		color: var(--kitchen-honey-ink);
		font-size: 0.65rem;
		font-weight: 750;
	}

	.plan-actions {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 2.75rem;
		gap: 0.4rem;
	}

	.plan-actions :global(.ui-action) {
		min-width: 0;
		padding-inline: 0.55rem;
		font-size: 0.72rem;
	}

	.plan-ledger {
		padding-block: 0.75rem max(6.5rem, var(--ui-overlay-bottom));
	}

	.plan-current-week .meal-row {
		border-color: color-mix(in oklab, var(--kitchen-olive) 44%, var(--kitchen-line));
	}

	.plan-meal-list {
		display: grid;
		gap: 0.625rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.meal-row {
		display: grid;
		grid-template-columns: 2.75rem minmax(0, 1fr) 2.75rem;
		align-items: center;
		column-gap: 0.35rem;
		border: 1px solid color-mix(in oklab, var(--kitchen-grove) 15%, var(--kitchen-line));
		border-radius: 0.875rem;
		padding: 0.45rem 0.7rem 0.65rem;
		background: var(--kitchen-card);
		box-shadow: 0 4px 12px rgb(35 58 46 / 7%);
		transition:
			border-color var(--motion-micro) var(--ease-standard),
			box-shadow var(--motion-micro) var(--ease-standard);
	}

	.meal-row:hover,
	.meal-row:focus-within {
		border-color: color-mix(in oklab, var(--kitchen-grove) 28%, var(--kitchen-line));
		box-shadow: 0 6px 16px rgb(35 58 46 / 10%);
	}

	.meal-check,
	.meal-title,
	.meal-remove {
		min-height: 2.75rem;
	}

	.meal-check {
		display: inline-flex;
		width: 2.75rem;
		cursor: pointer;
		align-items: center;
		justify-content: center;
	}

	.meal-title {
		display: flex;
		min-width: 0;
		align-items: center;
		overflow: hidden;
		font-size: 0.875rem;
		font-weight: 600;
		line-height: 1.3;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meal-remove {
		width: 2.75rem;
		padding: 0;
		color: color-mix(in oklab, var(--color-base-content) 52%, transparent);
	}

	.meal-remove:hover,
	.meal-remove:focus-visible {
		color: var(--color-error);
	}

	.meal-details {
		grid-column: 1 / -1;
		display: grid;
		gap: 0.4rem;
		min-width: 0;
		padding-left: 3.1rem;
	}

	.meal-details:empty {
		display: none;
	}

	.meal-portion-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
	}

	.meal-serving-stepper {
		min-width: 8.5rem;
	}

	.meal-source-row {
		min-width: 0;
	}

	.rotation-ledger {
		display: grid;
		gap: 0.8rem;
		border-top: 1px solid var(--kitchen-line);
		padding: 1rem 0.8rem;
		background: color-mix(in oklab, var(--kitchen-card) 88%, var(--kitchen-honey) 12%);
	}

	.rotation-lane {
		display: grid;
		gap: 0.55rem;
	}

	.rotation-lane h3 {
		font-size: 0.8rem;
		font-weight: 800;
		letter-spacing: 0.01em;
	}

	.rotation-lane > div > p,
	.rotation-row p {
		color: color-mix(in oklab, var(--color-base-content) 58%, transparent);
		font-size: 0.72rem;
	}

	.rotation-lane ul {
		display: grid;
		gap: 0.4rem;
	}

	.rotation-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.7rem;
		min-height: 3.75rem;
		border: 1px solid var(--kitchen-line);
		border-radius: 0.85rem;
		padding: 0.55rem 0.6rem 0.55rem 0.75rem;
		background: var(--kitchen-card);
	}

	.rotation-row strong {
		display: block;
		overflow: hidden;
		font-size: 0.85rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (min-width: 48rem) {
		.plan-header-payload {
			grid-template-columns: minmax(0, 1fr) minmax(18rem, 0.72fr);
			align-items: center;
			gap: 1rem;
		}

		.plan-actions {
			align-self: center;
		}

		.plan-ledger {
			padding-block: 1.1rem max(6.5rem, var(--ui-overlay-bottom));
		}
	}

</style>

<BottomSheet bind:open={controller.drawerOpen} title={m.mealplan_add_meal_sheet_title()}>
	<form
		onsubmit={(event) => {
			// Enter only dismisses the keyboard — planning the typed text as a
			// custom dinner stays an explicit tap on the dashed row below (H5).
			event.preventDefault();
		}}
	>
		<input
			type="search"
			class="ui-field w-full"
			placeholder={m.mealplan_search_recipes_placeholder()}
			aria-label={m.mealplan_search_recipes_aria()}
			autocomplete="off"
			bind:value={controller.drawerSearch}
		/>
	</form>

	<div class="mt-3 flex flex-wrap gap-1.5">
		{#each DRAWER_CATEGORIES as cat}
			<FilterChip
				selected={controller.drawerCategory === cat}
				onclick={() => (controller.drawerCategory = controller.drawerCategory === cat ? '' : cat)}
			>
				{cat}
			</FilterChip>
		{/each}
	</div>

	{#if controller.drawerSearch.trim()}
		<button
			type="button"
			class="ui-action ui-action-secondary mt-3 w-full justify-between text-left"
			onclick={controller.addCustomFromSearch}
			disabled={controller.drawerSubmitting}
			transition:slide={{ duration: MOTION_MICRO_MS }}
		>
			<span class="min-w-0 flex-1 truncate text-sm">{m.mealplan_plan_custom_button({ query: controller.drawerSearch.trim() })}</span>
			<StatusBadge class="shrink-0">{m.mealplan_custom_chip()}</StatusBadge>
		</button>
	{/if}

	<section class="mt-5">
		<h3 class="ui-section-title mb-2">{m.mealplan_recipe_library_heading()}</h3>
		{#if controller.filteredRecipes.length === 0}
			<EmptyState mini title={m.mealplan_no_recipes_found_title()} description={m.mealplan_no_recipes_found_desc()} />
		{:else}
			<ul class="ui-list-group divide-y divide-base-200">
				{#each controller.filteredRecipes as recipe}
					{@const title = controller.recipeDisplayTitle(recipe)}
					{@const cat = controller.recipeDisplayCategory(recipe)}
					{@const key = controller.addKey(controller.drawerWeek, title, recipe.slug)}
					<li class="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
						<span class="min-w-0">
							<span class="block truncate text-sm font-medium">{title}</span>
							{#if cat}
								<span class="text-xs text-base-content/45">{cat}</span>
							{/if}
						</span>
						<MealSourceChoice
							baselineServings={recipe.servings}
							frozenPortions={recipe.onHandPortions}
							servings={recipe.servings}
							compact
							disabled={controller.drawerSubmitting || !!controller.pendingAdds[key]}
							onselect={(source) => controller.addMealFromRecipe(recipe, source)}
						/>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</BottomSheet>

<FreezePortionsModal
	bind:open={controller.freezeOpen}
	slug={controller.freezeSlug}
	title={controller.freezeTitle}
	defaultPortions={controller.freezeDefault}
	onFrozen={() => void invalidateAll()}
/>

<ConsumePortionsModal
	bind:open={controller.consumeOpen}
	slug={controller.consumeSlug}
	title={controller.consumeTitle}
	defaultPortions={controller.consumeDefault}
	maxPortions={controller.consumeMax}
	onConsumed={(consumed, remaining) => {
		toast.success(
			remaining > 0
				? m.mealplan_toast_consumed_remaining({ count: consumed, remaining })
				: m.mealplan_toast_consumed_last({ count: consumed })
		);
		// Refresh onHandPortions so freezer chips and the drawer stay honest.
		void invalidateAll();
	}}
/>
