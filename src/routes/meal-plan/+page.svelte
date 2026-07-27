<script lang="ts">
	import { base } from '$app/paths';
	import { untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import { slide } from 'svelte/transition';
	import { invalidateAll } from '$app/navigation';
	import ConsumePortionsModal from '$lib/components/ConsumePortionsModal.svelte';
	import FreezePortionsModal from '$lib/components/FreezePortionsModal.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import KitchenPageHeader from '$lib/components/ui/KitchenPageHeader.svelte';
	import KitchenWeekNavigator from '$lib/components/ui/KitchenWeekNavigator.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { APP_TIME_ZONE } from '$lib/week';
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';
	import { formatDate } from '$lib/i18n';
	import { MOTION_CONTENT_MS, MOTION_MICRO_MS } from '$lib/motion';
	import { batchServingTarget, batchServingToggleTarget } from '$lib/meal_batch';
	import { mealPlanWeekHref } from '$lib/meal_plan_navigation';
	import MealSourceChoice from '$lib/components/meal-plan/MealSourceChoice.svelte';
	import {
		MealPlanController,
		type MealPlanControllerData
	} from '$lib/components/meal-plan/controller.svelte';

	type Meal = PageData['weeks'][number]['meals'][number];
	type Week = PageData['weeks'][number];
	type Recipe = PageData['recipeList'][number];

	let { data }: { data: PageData } = $props();
	const controller = new MealPlanController(
		untrack(() => data as MealPlanControllerData),
		{ basePath: base }
	);
	$effect(() => {
		controller.syncData(data as MealPlanControllerData);
	});
	let currentWeekStart = $derived(controller.currentWeekStart);
	let selectedWeek = $derived(controller.selectedWeek);
	let adjacentWeeks = $derived(controller.adjacentWeeks);
	let filteredRecipes = $derived(controller.filteredRecipes);
	let suggestLines = $derived(controller.suggestLines);
	let prefs = $derived(controller.prefs);
	let dayPlanning = $derived(controller.dayPlanning);
	let drawerWeek = $derived(controller.drawerWeek);
	let drawerSubmitting = $derived(controller.drawerSubmitting);
	let suggestActive = $derived(controller.suggestActive);
	let suggestText = $derived(controller.suggestText);
	let suggestLoading = $derived(controller.suggestLoading);
	let suggestError = $derived(controller.suggestError);
	let applyingSuggestion = $derived(controller.applyingSuggestion);
	let addedSuggestions = $derived(controller.addedSuggestions);
	let pendingAdds = $derived(controller.pendingAdds);
	let pendingToggles = $derived(controller.pendingToggles);
	let pendingDeletes = $derived(controller.pendingDeletes);
	let pendingSourceToggles = $derived(controller.pendingSourceToggles);
	let pendingServings = $derived(controller.pendingServings);
	let servingsStatus = $derived(controller.servingsStatus);
	let freezeSlug = $derived(controller.freezeSlug);
	let freezeTitle = $derived(controller.freezeTitle);
	let freezeDefault = $derived(controller.freezeDefault);
	let consumeSlug = $derived(controller.consumeSlug);
	let consumeTitle = $derived(controller.consumeTitle);
	let consumeDefault = $derived(controller.consumeDefault);
	let consumeMax = $derived(controller.consumeMax);

	const DRAWER_CATEGORIES = ['meat', 'vegetarian', 'vegan', 'fish', 'pasta', 'soup', 'dessert'];

	function recipeDisplayTitle(recipe: Recipe): string {
		return controller.recipeDisplayTitle(recipe);
	}

	function recipeForMeal(meal: Meal): Recipe | undefined {
		return controller.recipeForMeal(meal);
	}

	function frozenPortionsFor(meal: Meal): number {
		return controller.frozenPortionsFor(meal);
	}

	function recipeDisplayCategory(recipe: Recipe): string | null {
		return controller.recipeDisplayCategory(recipe);
	}

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

	function weekDayOptions(weekStartDate: string): { date: string; label: string }[] {
		return controller.weekDayOptions(weekStartDate);
	}

	function displayMeals(week: Week): Meal[] {
		return controller.displayMeals(week);
	}

	function addKey(weekStartDate: string, dinner: string, recipeSlug: string | null = null): string {
		return controller.addKey(weekStartDate, dinner, recipeSlug);
	}

	const openAddDrawer = controller.openAddDrawer;

	const addMealOptimistic = controller.addMealOptimistic;
	const toggleCooked = controller.toggleCooked;
	const setMealSource = controller.setMealSource;
	const setPlannedDate = controller.setPlannedDate;
	const removeMeal = controller.removeMeal;
	const addMealFromRecipe = controller.addMealFromRecipe;
	const setServings = controller.setServings;
	const changeServings = controller.changeServings;
	const addCustomFromSearch = controller.addCustomFromSearch;
	const startSuggest = controller.startSuggest;
	const closeSuggest = controller.closeSuggest;
	const applySuggestion = controller.applySuggestion;
</script>

<svelte:head>
	<title>{m.mealplan_title()}</title>
</svelte:head>

<div class="meal-plan-page">
	<p class="sr-only" aria-live="polite">{servingsStatus}</p>
	<KitchenPageHeader eyebrow={m.mealplan_header_context()} title={m.mealplan_heading()}>
		{#snippet actions()}
			{#if selectedWeek}
			<details class="dropdown dropdown-end">
				<summary
					class="plan-more ui-kitchen-header-action ui-kitchen-header-action-icon"
					aria-label={m.mealplan_more_options_aria()}
				>
					<span aria-hidden="true">⋯</span>
				</summary>
				<ul
					class="menu dropdown-content z-30 mt-2 w-56 rounded-box border border-base-300 bg-base-100 p-2 text-base-content shadow-lg"
				>
					{#if data.hasPastWeeks || data.showPastWeeks}
						<li>
							<a
								href={mealPlanWeekHref(
									base,
									selectedWeek.weekStartDate,
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
			{/if}
		{/snippet}

		{#if selectedWeek}
			{@const week = selectedWeek}
			<div class="plan-header-payload">
				<KitchenWeekNavigator
					previousHref={adjacentWeeks.previous
						? mealPlanWeekHref(
								base,
								adjacentWeeks.previous.weekStartDate,
								data.showPastWeeks
							)
						: null}
					nextHref={adjacentWeeks.next
						? mealPlanWeekHref(base, adjacentWeeks.next.weekStartDate, data.showPastWeeks)
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
							{#if week.weekStartDate === currentWeekStart}
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
				class="plan-action plan-shopping"
			>
				<Icon name="cart" class="h-4 w-4" />
				{m.mealplan_shopping_link()}
			</a>
			<button
				type="button"
				class="plan-action plan-suggest"
				onclick={() => startSuggest(week.weekStartDate)}
				disabled={suggestLoading && suggestActive === week.weekStartDate}
			>
				{suggestLoading && suggestActive === week.weekStartDate
					? m.mealplan_thinking_label()
					: m.mealplan_suggest_button()}
			</button>
			<button
				type="button"
				class="plan-action plan-add"
				onclick={() => openAddDrawer(week.weekStartDate)}
			>
				<Icon name="plus" class="h-4 w-4" />
				{m.mealplan_add_meal()}
			</button>
				</div>
			</div>
		{/if}
	</KitchenPageHeader>

	<main class="plan-ledger ui-kitchen-content">
		{#if selectedWeek}
			{@const week = selectedWeek}
		<div>
			<section
				id="week-{week.weekStartDate}"
				class="ui-list-card {week.weekStartDate === currentWeekStart ? 'border-primary/60' : ''}"
			>
				{#if week.meals.length > 0}
					<ul class="divide-y divide-base-200">
						{#each displayMeals(week) as meal (meal.id)}
							{@const linkedRecipe = recipeForMeal(meal)}
							<li
								class="meal-row transition-colors hover:bg-base-200/60"
								transition:slide={{ duration: MOTION_MICRO_MS }}
								animate:flip={{ duration: MOTION_CONTENT_MS }}
							>
								<label class="meal-check">
									<input
										type="checkbox"
										class="checkbox checkbox-md"
										checked={meal.status === 'cooked'}
										disabled={!!pendingToggles[meal.id]}
										aria-label={m.mealplan_mark_cooked_aria({ dinner: meal.dinner })}
										onchange={() => toggleCooked(meal)}
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
									class="meal-remove btn btn-ghost"
									onclick={() => removeMeal(meal)}
									disabled={!!pendingDeletes[meal.id]}
									aria-label={m.mealplan_remove_meal_aria({ dinner: meal.dinner })}
								>
									<Icon name="trash" />
								</button>
								<div class="meal-details">
									{#if dayPlanning && meal.status !== 'cooked'}
										<select
											class="select select-bordered select-xs w-24 {meal.plannedDate ? '' : 'text-base-content/40'}"
											value={meal.plannedDate ?? ''}
											disabled={!!pendingToggles[meal.id] || meal.id < 0}
											aria-label={m.mealplan_day_picker_aria({ dinner: meal.dinner })}
											onchange={(e) => setPlannedDate(meal, e.currentTarget.value || null)}
										>
											<option value="">{m.mealplan_day_unplanned()}</option>
											{#each weekDayOptions(week.weekStartDate) as day (day.date)}
												<option value={day.date}>{day.label}</option>
											{/each}
										</select>
									{/if}
									{#if meal.status !== 'cooked' && meal.recipeSlug && meal.servings}
										<div class="meal-portion-row">
											<div class="meal-serving-stepper inline-flex items-center rounded-lg border border-base-300" aria-label={m.mealplan_servings_label()} aria-busy={!!pendingServings[meal.id]}>
												<button type="button" class="btn btn-ghost btn-xs h-11 min-h-0 rounded-r-none" disabled={meal.servings <= 1} aria-disabled={!!pendingServings[meal.id] || meal.servings <= 1} aria-label={m.mealplan_decrease_servings_aria({ dinner: meal.dinner })} onclick={() => !pendingServings[meal.id] && changeServings(meal, -1)}>−</button>
												<span class="min-w-0 flex-1 px-1 text-center text-xs tabular-nums">{m.mealplan_servings_count({ count: meal.servings })}</span>
												<button type="button" class="btn btn-ghost btn-xs h-11 min-h-0 rounded-l-none" disabled={meal.servings >= 99} aria-disabled={!!pendingServings[meal.id] || meal.servings >= 99} aria-label={m.mealplan_increase_servings_aria({ dinner: meal.dinner })} onclick={() => !pendingServings[meal.id] && changeServings(meal, 1)}>+</button>
											</div>
											{#if linkedRecipe && meal.source !== 'freezer'}
												<div class="meal-batch-options" aria-label={linkedRecipe.scalingMode === 'fixed_batch' ? m.mealplan_batch_fixed() : m.mealplan_batch_scalable()}>
													{#each [2, 3, 4] as multiplier}
														{@const target = batchServingTarget(linkedRecipe.servings, multiplier)}
														{@const pressed = target === meal.servings}
														{@const toggleTarget = batchServingToggleTarget(
															linkedRecipe.servings,
															multiplier,
															meal.servings
														)}
														<button
															type="button"
															class="btn btn-xs h-11 min-h-0 w-11 px-0 {pressed ? 'btn-primary' : 'btn-ghost border border-base-300'}"
															disabled={toggleTarget == null}
															aria-disabled={toggleTarget == null || !!pendingServings[meal.id]}
															aria-label={target == null
																? m.mealplan_batch_unavailable_aria({ multiplier, dinner: meal.dinner })
																: pressed && toggleTarget != null
																	? m.mealplan_batch_reset_aria({
																			count: toggleTarget,
																			dinner: meal.dinner
																		})
																	: m.mealplan_batch_aria({
																			multiplier,
																			count: target,
																			dinner: meal.dinner
																		})}
															aria-pressed={pressed}
															onclick={() =>
																toggleTarget != null &&
																!pendingServings[meal.id] &&
																setServings(meal, toggleTarget)}
														>
															×{multiplier}
														</button>
													{/each}
												</div>
											{/if}
										</div>
									{/if}
									{#if meal.cookedDate && meal.status === 'cooked'}
										<span class="inline-flex items-center gap-1 text-xs text-base-content/35">
											<Icon name="check" class="h-3 w-3" />
											{cookedDateLabel(meal.cookedDate)}
										</span>
									{/if}
									{#if meal.status !== 'cooked' && meal.recipeSlug && (meal.source === 'freezer' || frozenPortionsFor(meal) > 0)}
										{@const onHand = frozenPortionsFor(meal)}
										{@const linkedForSource = recipeForMeal(meal)}
										{#if linkedForSource && meal.servings}
											<div class="meal-source-row">
												<MealSourceChoice
													source={meal.source}
													baselineServings={linkedForSource.servings}
													frozenPortions={onHand}
													servings={meal.servings}
													compact
													disabled={!!pendingSourceToggles[meal.id] || meal.id < 0}
													onselect={(source) => setMealSource(meal, source)}
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

				{#if suggestActive === week.weekStartDate}
					<div class="border-t border-base-200 bg-base-200/35 px-3 py-3" transition:slide={{ duration: MOTION_CONTENT_MS }}>
						<div class="mb-2 flex items-center justify-between gap-2">
							<p class="ui-section-label">{m.mealplan_ai_suggestions_label()}</p>
							<button type="button" class="btn btn-ghost btn-xs" onclick={closeSuggest}>
								{m.mealplan_close_suggest_button()}
							</button>
						</div>
						{#if suggestLoading}
							<div class="flex items-center gap-2 py-2 text-sm text-base-content/60">
								<Spinner variant="simmer" size="xs" />
								{m.mealplan_thinking_label()}
							</div>
							{#if suggestText}
								<div class="mt-2 whitespace-pre-wrap rounded-xl bg-base-100 px-3 py-2 text-sm text-base-content/75">
									{suggestText}
								</div>
							{/if}
						{:else if suggestError}
							<div class="rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-sm text-error" role="alert">
								{suggestError}
							</div>
							<button type="button" class="btn btn-outline btn-xs mt-2" onclick={() => startSuggest(week.weekStartDate)}>
								{m.mealplan_retry_button()}
							</button>
						{:else if suggestLines.length > 0}
							<div class="flex flex-col gap-1.5">
								{#each suggestLines as suggestion}
									{@const key = addKey(week.weekStartDate, suggestion)}
									<div class="flex items-center justify-between gap-2 rounded-xl bg-base-100 px-3 py-2">
										<span class="min-w-0 flex-1 truncate text-sm">{suggestion}</span>
										{#if addedSuggestions[key]}
											<span class="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-success">
												<Icon name="check" class="h-3.5 w-3.5" />
												{m.mealplan_planned_chip()}
											</span>
										{:else}
											<button
												type="button"
												class="btn btn-primary btn-xs"
												onclick={() => applySuggestion(suggestion)}
												disabled={!!applyingSuggestion[key] || !!pendingAdds[key]}
											>
												{m.mealplan_add_suggestion_button()}
											</button>
										{/if}
									</div>
								{/each}
							</div>
						{:else if suggestText}
							<div class="whitespace-pre-wrap rounded-xl bg-base-100 px-3 py-2 text-sm text-base-content/75">
								{suggestText}
							</div>
						{/if}
					</div>
				{/if}
			</section>
		</div>
		{/if}
	</main>
</div>

<style>
	.meal-plan-page {
		min-height: 100%;
		background: var(--kitchen-paper);
		padding-bottom: calc(var(--ui-fixed-bar-height) + 1.5rem);
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
		color: #d7e0d9;
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
		border: 1px solid rgb(242 202 116 / 55%);
		border-radius: 999px;
		padding: 0 0.5rem;
		background: rgb(242 202 116 / 13%);
		color: #f2ca74;
		font-size: 0.65rem;
		font-weight: 750;
	}

	.plan-actions {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr) minmax(0, 1fr);
		gap: 0.4rem;
	}

	.plan-action {
		display: inline-flex;
		min-width: 0;
		min-height: 2.75rem;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		border-radius: 0.72rem;
		padding: 0 0.55rem;
		font-size: 0.72rem;
		font-weight: 750;
	}

	.plan-shopping {
		border: 1px solid rgb(255 255 255 / 25%);
		background: rgb(255 255 255 / 8%);
	}

	.plan-suggest {
		color: #e4ebe6;
	}

	.plan-add {
		background: var(--kitchen-terra);
		color: white;
		box-shadow: 0 5px 16px rgb(20 28 23 / 20%);
	}

	.plan-action:hover,
	.plan-action:focus-visible {
		background-color: rgb(255 255 255 / 16%);
	}

	.plan-add:hover,
	.plan-add:focus-visible {
		background-color: color-mix(in oklab, var(--kitchen-terra) 86%, white);
	}

	.plan-ledger {
		padding-block: 0.75rem max(6.5rem, var(--ui-overlay-bottom));
	}

	.meal-row {
		display: grid;
		grid-template-columns: 2.75rem minmax(0, 1fr) 2.75rem;
		align-items: center;
		column-gap: 0.35rem;
		padding: 0.45rem 0.7rem 0.65rem;
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

	.meal-remove.btn {
		width: 2.75rem;
		padding: 0;
		color: color-mix(in oklab, var(--color-base-content) 52%, transparent);
	}

	.meal-remove.btn:hover,
	.meal-remove.btn:focus-visible {
		color: var(--color-error);
	}

	.meal-details {
		grid-column: 1 / -1;
		display: grid;
		gap: 0.4rem;
		min-width: 0;
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

	.meal-batch-options {
		display: inline-grid;
		grid-template-columns: repeat(3, 2.75rem);
		gap: 0.35rem;
	}

	.meal-source-row {
		min-width: 0;
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

	@media (min-width: 64rem) {
		.meal-row {
			grid-template-columns: 2.75rem minmax(12rem, 1fr) 2.75rem auto;
		}

		.meal-title {
			grid-column: 2;
			grid-row: 1;
		}

		.meal-remove.btn {
			grid-column: 3;
			grid-row: 1;
		}

		.meal-details {
			grid-column: 4;
			grid-row: 1;
			display: flex;
			align-items: center;
			justify-content: flex-end;
			gap: 0.5rem;
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
			class="input input-bordered input-sm w-full"
			placeholder={m.mealplan_search_recipes_placeholder()}
			aria-label={m.mealplan_search_recipes_aria()}
			autocomplete="off"
			bind:value={controller.drawerSearch}
		/>
	</form>

	<div class="mt-3 flex flex-wrap gap-1.5">
		{#each DRAWER_CATEGORIES as cat}
			<button
				type="button"
				class={controller.drawerCategory === cat ? 'ui-chip-active' : 'ui-chip'}
				aria-pressed={controller.drawerCategory === cat}
				onclick={() => (controller.drawerCategory = controller.drawerCategory === cat ? '' : cat)}
			>
				{cat}
			</button>
		{/each}
	</div>

	{#if controller.drawerSearch.trim()}
		<button
			type="button"
			class="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-base-300 px-3 py-2.5 text-left transition-colors hover:bg-base-200/60 disabled:opacity-50"
			onclick={addCustomFromSearch}
			disabled={drawerSubmitting}
			transition:slide={{ duration: MOTION_MICRO_MS }}
		>
			<span class="min-w-0 flex-1 truncate text-sm">{m.mealplan_plan_custom_button({ query: controller.drawerSearch.trim() })}</span>
			<span class="ui-chip-muted shrink-0">{m.mealplan_custom_chip()}</span>
		</button>
	{/if}

	<section class="mt-5">
		<h3 class="ui-section-label mb-2">{m.mealplan_recipe_library_heading()}</h3>
		{#if filteredRecipes.length === 0}
			<EmptyState mini title={m.mealplan_no_recipes_found_title()} description={m.mealplan_no_recipes_found_desc()} />
		{:else}
			<ul class="ui-list-card divide-y divide-base-200">
				{#each filteredRecipes as recipe}
					{@const title = recipeDisplayTitle(recipe)}
					{@const cat = recipeDisplayCategory(recipe)}
					{@const key = addKey(drawerWeek, title, recipe.slug)}
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
							disabled={drawerSubmitting || !!pendingAdds[key]}
							onselect={(source) => addMealFromRecipe(recipe, source)}
						/>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</BottomSheet>

<FreezePortionsModal
	bind:open={controller.freezeOpen}
	slug={freezeSlug}
	title={freezeTitle}
	defaultPortions={freezeDefault}
	onFrozen={() => void invalidateAll()}
/>

<ConsumePortionsModal
	bind:open={controller.consumeOpen}
	slug={consumeSlug}
	title={consumeTitle}
	defaultPortions={consumeDefault}
	maxPortions={consumeMax}
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
