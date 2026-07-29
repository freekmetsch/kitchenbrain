<script lang="ts">
	import { base } from '$app/paths';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import {
		CORE_FOOD_TYPE_OPTIONS,
		foodCategoryLabel
	} from '$lib/food_categories';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import FilterChip from '$lib/components/ui/FilterChip.svelte';
	import KitchenPageHeader from '$lib/components/ui/KitchenPageHeader.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import SmartImage from '$lib/components/ui/SmartImage.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { onDestroy, untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import { fade } from 'svelte/transition';
	import { m } from '$lib/paraglide/messages';
	import { scrollRail } from '$lib/actions/scroll_rail';
	import { MOTION_CONTENT_MS, MOTION_MICRO_MS } from '$lib/motion';
	import AddToPlanSheet from '$lib/components/recipe-detail/AddToPlanSheet.svelte';
	import MakeRecipeSheet from '$lib/components/recipe-detail/MakeRecipeSheet.svelte';
	import FreezePortionsModal from '$lib/components/FreezePortionsModal.svelte';
	import { labelWeeks } from '$lib/components/recipe-detail/types';

	type Recipe = {
		id: number;
		slug: string;
		title: string;
		titleEn: string | null;
		category: string | null;
		categoryEn: string | null;
		rating: number | null;
		imageUrl: string | null;
		lastCookedAt: string | Date | null;
		cookedCount: number;
		foodClass: string | null;
		coverage: number;
		ingredientTotal: number;
		hasAllIngredients: boolean;
		onHandPortions: number;
		belowTarget: boolean;
		isFreezerStaple: boolean;
		targetPortions: number | null;
		needsReview: boolean;
		subCount: number;
		servings: number | null;
		scalingMode: 'scalable' | 'fixed_batch';
	};

	type Toggles = {
		haveAll: boolean;
		freezerOnly: boolean;
		belowTargetOnly: boolean;
	};

	let {
		data
	}: {
		data: {
			recipes: Recipe[];
			query: string;
			sortBy: string;
			classFilter: string;
			dishFilter: string;
			ingredientFilter: string;
			toggles: Toggles;
			dishTypes: string[];
			recipeLang: 'en' | 'nl';
			weeks: { weekStartDate: string; weekNumber: number }[];
		};
	} = $props();
	let actionRecipe = $state<Recipe | null>(null);
	let planOpen = $state(false);
	let makeOpen = $state(false);
	let freezeOpen = $state(false);
	let cookedPortions = $state(2);
	let actionWeeks = $derived(labelWeeks(data.weeks, {
		thisWeek: m.recipes_week_this(),
		nextWeek: m.recipes_week_next(),
		weekOf: (date) => m.recipes_freezer_week_of({ date })
	}));

	function openPlan(recipe: Recipe) {
		actionRecipe = recipe;
		planOpen = true;
	}

	function openMake(recipe: Recipe) {
		actionRecipe = recipe;
		makeOpen = true;
	}

	let searchInput = $state(untrack(() => data.query));
	let sortBy = $state(untrack(() => data.sortBy));
	let classFilter = $state(untrack(() => data.classFilter));
	let dishFilter = $state(untrack(() => data.dishFilter));
	let ingredientFilter = $state(untrack(() => data.ingredientFilter));

	// Filters round-trip through the URL (goto/load). Browser back/forward
	// re-runs load and updates `data` without touching these locals, so without
	// this re-sync the visible chip/search state silently desyncs from the
	// actual results. Compare against the last-synced value (not the live local)
	// so we don't clobber in-flight typing in the search box on every rerun.
	let lastSyncedQuery = untrack(() => data.query);
	$effect(() => {
		if (data.query !== lastSyncedQuery) {
			searchInput = data.query;
			lastSyncedQuery = data.query;
		}
		sortBy = data.sortBy;
		classFilter = data.classFilter;
		dishFilter = data.dishFilter;
		ingredientFilter = data.ingredientFilter;
	});

	let scrapeOpen = $state(false);
	let scrapeUrl = $state('');
	let scrapeLoading = $state(false);
	let scrapeError = $state('');

	// New Meal Recipe picker (ADR 0003): choose ≥ 2 non-meal recipes + a name.
	let newMealOpen = $state(false);
	let newMealTitle = $state('');
	let newMealQuery = $state('');
	let newMealSlugs = $state<string[]>([]);
	let newMealLoading = $state(false);
	let newMealError = $state('');

	let mealCandidates = $derived(
		data.recipes
			.filter((r) => r.subCount === 0)
			.filter((r) => {
				if (newMealSlugs.includes(r.slug)) return true;
				const q = newMealQuery.trim().toLowerCase();
				if (!q) return true;
				return (
					r.title.toLowerCase().includes(q) || (r.titleEn?.toLowerCase().includes(q) ?? false)
				);
			})
	);

	function toggleMealSlug(slug: string) {
		newMealSlugs = newMealSlugs.includes(slug)
			? newMealSlugs.filter((s) => s !== slug)
			: [...newMealSlugs, slug];
	}

	async function createMeal() {
		if (newMealLoading || newMealSlugs.length < 2 || !newMealTitle.trim()) return;
		newMealLoading = true;
		newMealError = '';
		try {
			const res = await fetch(`${base}/api/meals`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: newMealTitle.trim(), sub_recipe_slugs: newMealSlugs })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				newMealError = body.message ?? m.recipes_toast_could_not_create_meal();
				toast.error(newMealError);
			} else {
				newMealOpen = false;
				await goto(`${base}/recipes/${body.slug}`);
			}
		} catch {
			newMealError = m.recipes_toast_connection_error();
			toast.error(newMealError);
		}
		newMealLoading = false;
	}

	type ToggleName = keyof Toggles;

	// data.toggles uses JS names; the URL contract uses short param names.
	const TOGGLE_PARAM: Record<ToggleName, 'have' | 'freezer' | 'below'> = {
		haveAll: 'have',
		freezerOnly: 'freezer',
		belowTargetOnly: 'below'
	};

	function recipeHref(overrides: {
		q?: string;
		sort?: string;
		class?: string;
		dish?: string;
		ingredient?: string;
		have?: boolean;
		freezer?: boolean;
		below?: boolean;
	} = {}) {
		const params = new URLSearchParams();
		const nextQ = overrides.q ?? searchInput;
		const nextSort = overrides.sort ?? sortBy;
		const nextClass = overrides.class ?? classFilter;
		const nextDish = overrides.dish ?? dishFilter;
		const nextIngredient = overrides.ingredient ?? ingredientFilter;
		const nextHave = overrides.have ?? data.toggles.haveAll;
		const nextFreezer = overrides.freezer ?? data.toggles.freezerOnly;
		const nextBelow = overrides.below ?? data.toggles.belowTargetOnly;
		if (nextQ) params.set('q', nextQ);
		if (nextSort !== 'title') params.set('sort', nextSort);
		if (nextClass) params.set('class', nextClass);
		if (nextDish) params.set('dish', nextDish);
		if (nextIngredient) params.set('ingredient', nextIngredient);
		if (nextHave) params.set('have', '1');
		if (nextFreezer) params.set('freezer', '1');
		if (nextBelow) params.set('below', '1');
		const qs = params.toString();
		return `${base}/recipes${qs ? '?' + qs : ''}`;
	}

	function search() {
		goto(recipeHref());
	}

	// Search behaves like a live filter. Replacing the current URL avoids a
	// browser-back entry for every short pause while typing.
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	function scheduleSearch() {
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			searchTimer = null;
			void goto(recipeHref(), { replaceState: true, keepFocus: true, noScroll: true });
		}, 300);
	}
	onDestroy(() => {
		if (searchTimer) clearTimeout(searchTimer);
	});

	function setClass(value: string) {
		const next = classFilter === value ? '' : value;
		classFilter = next;
		goto(recipeHref({ class: next }));
	}

	function setDish(value: string) {
		const next = dishFilter === value ? '' : value;
		dishFilter = next;
		goto(recipeHref({ dish: next }));
	}

	function toggle(name: ToggleName) {
		const next = !data.toggles[name];
		goto(recipeHref({ [TOGGLE_PARAM[name]]: next }));
	}

	const anyToggle = $derived(
		data.toggles.haveAll ||
			data.toggles.freezerOnly ||
		data.toggles.belowTargetOnly
	);
	const hasActiveFilters = $derived(
		Boolean(data.query || ingredientFilter || classFilter || dishFilter || anyToggle)
	);

	function clearIngredientFilter() {
		ingredientFilter = '';
		goto(recipeHref({ ingredient: '' }));
	}

	function clearFilters() {
		searchInput = '';
		sortBy = 'title';
		classFilter = '';
		dishFilter = '';
		ingredientFilter = '';
		goto(recipeHref({ q: '', sort: 'title', class: '', dish: '', ingredient: '', have: false, freezer: false, below: false }));
	}

	async function scrape() {
		// Guard scrapeLoading too: the Import button is disabled mid-request but the
		// Enter key isn't, and a second Enter would fire a concurrent POST → a
		// duplicate recipe row (uniqueSlug happily inserts `x` then `x-1`).
		if (scrapeLoading || !scrapeUrl.trim()) return;
		scrapeLoading = true;
		scrapeError = '';
		try {
			const res = await fetch(`${base}/api/recipes/scrape`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: scrapeUrl.trim() })
			});
			const body = await res.json();
			if (!res.ok) {
				scrapeError = body.message ?? body.error ?? m.recipes_toast_scraping_failed();
				toast.error(scrapeError);
			} else {
				scrapeOpen = false;
				scrapeUrl = '';
				goto(`${base}/recipes/${body.slug}`);
			}
		} catch {
			scrapeError = m.recipes_toast_connection_error();
			toast.error(scrapeError);
		}
		scrapeLoading = false;
	}

	function stars(rating: number | null): string {
		if (!rating) return '';
		return '★'.repeat(rating) + '☆'.repeat(5 - rating);
	}

	function displayTitle(recipe: Recipe): string {
		return data.recipeLang === 'en' ? (recipe.titleEn ?? recipe.title) : recipe.title;
	}

	function displayCategory(recipe: Recipe): string | null {
		const category = data.recipeLang === 'en' ? (recipe.categoryEn ?? recipe.category) : recipe.category;
		return foodCategoryLabel(category);
	}

	function lastCookedLabel(recipe: Recipe): string | null {
		if (sortBy !== 'recent' && sortBy !== 'neglected' && sortBy !== 'most-cooked') return null;
		if (sortBy === 'most-cooked') {
			return recipe.cookedCount > 0
				? m.recipes_cooked_count_times({ count: recipe.cookedCount })
				: m.recipes_never_cooked();
		}
		if (!recipe.lastCookedAt) return m.recipes_never_cooked();
		const t = recipe.lastCookedAt instanceof Date ? recipe.lastCookedAt.getTime() : new Date(recipe.lastCookedAt).getTime();
		const days = Math.floor((Date.now() - t) / 86_400_000);
		if (days <= 0) return m.recipes_cooked_today();
		if (days === 1) return m.recipes_cooked_yesterday();
		if (days < 14) return m.recipes_cooked_days_ago({ days });
		if (days < 60) return m.recipes_cooked_weeks_ago({ weeks: Math.floor(days / 7) });
		return m.recipes_cooked_months_ago({ months: Math.floor(days / 30) });
	}

	function coverageLabel(recipe: Recipe): string | null {
		if (recipe.ingredientTotal <= 0) return null;
		if (recipe.hasAllIngredients) return m.recipes_have_all_label();
		if (recipe.coverage > 0) return m.recipes_coverage_on_hand({ have: recipe.coverage, total: recipe.ingredientTotal });
		return null;
	}
</script>

<svelte:head>
	<title>{m.recipes_title()}</title>
</svelte:head>

<div class="recipe-page">
	<KitchenPageHeader eyebrow={m.recipes_header_context()} title={m.recipes_heading()}>
		{#snippet action()}
			<button
				class="ui-action ui-action-primary"
				onclick={() => {
					scrapeOpen = true;
				}}>{m.recipes_import_button()}</button
			>
		{/snippet}
	</KitchenPageHeader>

	<div class="ui-page-utility">
		<div class="recipe-utility ui-page-utility-inner">
		<div class="recipe-search-row">
			<label class="ui-field-shell">
				<svg
					viewBox="0 0 16 16"
					class="h-4 w-4"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					aria-hidden="true"
				>
					<path d="M11.25 11.25 14 14" />
					<circle cx="7.25" cy="7.25" r="5" />
				</svg>
			<input
				type="search"
				placeholder={m.recipes_search_placeholder()}
				aria-label={m.recipes_search_aria()}
				bind:value={searchInput}
				oninput={scheduleSearch}
				onkeydown={(e) => {
					if (e.key !== 'Enter') return;
					if (searchTimer) clearTimeout(searchTimer);
					searchTimer = null;
					search();
				}}
			/>
			</label>
			<select
				class="ui-field"
				bind:value={sortBy}
				onchange={search}
				aria-label={m.recipes_sort_aria()}
			>
				<option value="title">{m.recipes_sort_az()}</option>
				<option value="rating">{m.recipes_sort_rating()}</option>
				<option value="recent">{m.recipes_sort_recent()}</option>
				<option value="neglected">{m.recipes_sort_neglected()}</option>
				<option value="most-cooked">{m.recipes_sort_most_cooked()}</option>
			</select>
		</div>
			<button
				class="ui-action ui-action-secondary"
				onclick={() => {
					newMealOpen = true;
					newMealTitle = '';
					newMealQuery = '';
					newMealSlugs = [];
					newMealError = '';
				}}>{m.recipes_new_meal_button()}</button
			>
		</div>
	</div>

	<!-- Chips toggle; the rail stays close to the results and scrolls on phones. -->
	<section class="recipe-filter-shell">
		<div class="recipe-filter-inner ui-kitchen-content">
		<div class="ui-scroll-rail flex items-center gap-1.5 pb-0.5" use:scrollRail>
			<FilterChip class="shrink-0" selected={data.toggles.haveAll} tone="success" onclick={() => toggle('haveAll')}>
				{m.recipes_filter_have_all()}
			</FilterChip>
			<FilterChip class="shrink-0" selected={data.toggles.freezerOnly} tone="info" onclick={() => toggle('freezerOnly')}>
				{m.recipes_filter_freezer_staple()}
			</FilterChip>
			<FilterChip class="shrink-0" selected={data.toggles.belowTargetOnly} tone="warning" onclick={() => toggle('belowTargetOnly')}>
				{m.recipes_filter_below_target()}
			</FilterChip>
			<span class="h-4 w-px shrink-0 bg-base-300" aria-hidden="true"></span>
			{#each CORE_FOOD_TYPE_OPTIONS as option}
				<FilterChip
					class="shrink-0"
					selected={classFilter === option.value}
					onclick={() => setClass(option.value)}
				>{foodCategoryLabel(option.value)}</FilterChip>
			{/each}
			{#if data.dishTypes.length}
				<span class="h-4 w-px shrink-0 bg-base-300" aria-hidden="true"></span>
			{/if}
			{#each data.dishTypes as dishType}
				<FilterChip
					class="shrink-0"
					selected={dishFilter === dishType}
					onclick={() => setDish(dishType)}
				>{foodCategoryLabel(dishType) ?? dishType}</FilterChip>
			{/each}
		</div>
		</div>
	</section>

	<main class="recipe-ledger ui-kitchen-content">
	{#if ingredientFilter}
		<div class="mb-3 flex items-center gap-2 rounded-xl border border-base-300 bg-base-200 px-3 py-2 text-sm">
			<span class="min-w-0 flex-1 truncate">{m.recipes_using_ingredient_prefix()} <strong>{ingredientFilter}</strong></span>
			<button class="ui-action ui-action-tertiary" onclick={clearIngredientFilter}>{m.recipes_clear_button()}</button>
		</div>
	{/if}

	<!-- Grid -->
	{#if data.recipes.length === 0}
		<EmptyState
			iconName="chefHat"
			title={hasActiveFilters ? m.recipes_empty_found_title() : m.recipes_empty_yet_title()}
			description={hasActiveFilters ? m.recipes_empty_found_desc() : m.recipes_empty_yet_desc()}
		>
			{#snippet action()}
				{#if hasActiveFilters}
					<button class="ui-action ui-action-secondary" onclick={clearFilters}>{m.recipes_clear_filters_button()}</button>
				{:else}
					<button class="ui-action ui-action-primary" onclick={() => (scrapeOpen = true)}>{m.recipes_import_recipe_button()}</button>
				{/if}
			{/snippet}
		</EmptyState>
	{:else}
		<div class="recipe-grid">
			{#each data.recipes as recipe (recipe.id)}
				{@const title = displayTitle(recipe)}
				{@const category = displayCategory(recipe)}
				{@const cookedLabel = lastCookedLabel(recipe)}
				{@const coverage = coverageLabel(recipe)}
				<article
					class="ui-recipe-card transition-colors hover:border-primary"
					animate:flip={{ duration: MOTION_CONTENT_MS }}
					in:fade={{ duration: MOTION_MICRO_MS }}
				>
					<a
						href="{base}/recipes/{recipe.slug}"
						class="recipe-card-main"
						class:has-image={!!recipe.imageUrl}
					>
					{#if recipe.imageUrl}
						<figure class="recipe-card-thumb">
							<SmartImage src={recipe.imageUrl} alt={title} class="h-full w-full" />
						</figure>
					{/if}
					<div class="recipe-card-copy">
						<div class="flex flex-wrap items-center gap-1">
							<h2 class="ui-recipe-card-title mr-auto min-w-0 line-clamp-2">{title}</h2>
							{#if category}
								<span class="recipe-category max-w-28 truncate">{category}</span>
							{/if}
							{#if recipe.rating}
								<span class="text-xs text-warning shrink-0">{stars(recipe.rating)}</span>
							{/if}
								{#if recipe.subCount > 0}
									<StatusBadge>{m.recipes_meal_badge({ count: recipe.subCount })}</StatusBadge>
								{/if}
								{#if recipe.needsReview}
									<StatusBadge tone="warning">{m.recipes_review_badge()}</StatusBadge>
								{/if}
								{#if coverage}
									<StatusBadge tone={recipe.hasAllIngredients ? 'success' : 'neutral'}>{coverage}</StatusBadge>
								{/if}
								{#if recipe.belowTarget}
									<StatusBadge tone="warning">{m.recipes_below_target_badge()}</StatusBadge>
								{:else if recipe.isFreezerStaple}
									<StatusBadge>{m.recipes_freezer_badge()}</StatusBadge>
								{/if}
							{#if cookedLabel}<span class="truncate text-xs text-base-content/40">{cookedLabel}</span>{/if}
						</div>
					</div>
					</a>
					<div class="recipe-card-actions grid grid-cols-2 gap-2 border-t border-base-300/70 p-2">
						<button type="button" class="ui-action ui-action-secondary" onclick={() => openPlan(recipe)}>{m.recipes_header_plan_button()}</button>
						<button type="button" class="ui-action ui-action-secondary" onclick={() => openMake(recipe)}>{m.recipes_make_button()}</button>
					</div>
				</article>
			{/each}
		</div>
	{/if}
	</main>
</div>

<style>
	.recipe-page {
		min-height: 100%;
		background: var(--kitchen-paper);
		padding-bottom: calc(var(--ui-fixed-bar-height) + 1.5rem);
	}

	.recipe-search-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(7.75rem, 0.38fr);
		gap: 0.5rem;
	}

	.recipe-utility {
		display: grid;
		gap: 0.5rem;
	}

	.recipe-filter-shell {
		position: sticky;
		z-index: 20;
		top: 0;
		border-bottom: 1px solid var(--kitchen-line);
		background: color-mix(in oklab, var(--kitchen-paper) 94%, transparent);
		backdrop-filter: blur(0.65rem);
	}

	.recipe-filter-inner {
		padding-block: 0.55rem;
	}

	.recipe-filter-inner button {
		min-height: 2.75rem;
	}

	.recipe-ledger {
		padding-block: 0.9rem max(6.5rem, var(--ui-overlay-bottom));
	}

	.recipe-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0;
	}

	.recipe-card-main {
		display: block;
		min-height: 4.25rem;
	}

	.recipe-card-main.has-image {
		display: grid;
		grid-template-columns: 5.25rem minmax(0, 1fr);
	}

	.recipe-card-thumb {
		min-height: 5.75rem;
		overflow: hidden;
		background: var(--color-base-200);
	}

	.recipe-card-thumb :global(img) {
		object-fit: cover;
	}

	.recipe-card-copy {
		display: flex;
		min-width: 0;
		align-items: center;
		padding: 0.8rem 0.875rem;
	}

	.recipe-category {
		color: color-mix(in oklab, var(--kitchen-olive) 78%, var(--kitchen-muted));
		font-size: 0.7rem;
		font-weight: 720;
		line-height: 1.2;
	}

	.recipe-grid :global(.ui-recipe-card) {
		border-width: 0 0 1px;
		border-radius: 0;
		box-shadow: none;
	}

	.recipe-grid :global(.ui-recipe-card:first-child) {
		border-top-width: 1px;
	}

	@media (min-width: 48rem) {
		.recipe-utility {
			grid-template-columns: minmax(0, 1fr) auto;
			align-items: center;
		}

		.recipe-search-row {
			grid-template-columns: minmax(0, 1fr) minmax(10rem, 0.32fr);
		}

		.recipe-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0.9rem;
		}

		.recipe-grid :global(.ui-recipe-card) {
			border-width: 1px;
			border-radius: 0.75rem;
			box-shadow: 0 1px 2px rgb(48 75 58 / 4%);
		}

	}

	@media (min-width: 68rem) {
		.recipe-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}

	}
</style>

{#if actionRecipe}
	<AddToPlanSheet
		bind:open={planOpen}
		weeks={actionWeeks}
		recipeSlug={actionRecipe.slug}
		dinnerTitle={displayTitle(actionRecipe)}
		frozenPortions={actionRecipe.onHandPortions}
		baselineServings={actionRecipe.servings ?? 4}
		scalingMode={actionRecipe.scalingMode}
	/>
	<MakeRecipeSheet
		bind:open={makeOpen}
		recipeSlug={actionRecipe.slug}
		recipeTitle={displayTitle(actionRecipe)}
		baselineServings={actionRecipe.servings ?? 4}
		scalingMode={actionRecipe.scalingMode}
		onAlreadyCooked={(servings) => {
			cookedPortions = servings;
			freezeOpen = true;
		}}
	/>
	<FreezePortionsModal
		bind:open={freezeOpen}
		slug={actionRecipe.slug}
		title={displayTitle(actionRecipe)}
		defaultPortions={cookedPortions}
		onFrozen={() => invalidateAll()}
	/>
{/if}

<BottomSheet bind:open={newMealOpen} title={m.recipes_new_meal_sheet_title()}>
	<div class="flex max-h-[62dvh] flex-col">
			<input
				type="text"
				class="ui-field mb-2 w-full"
				placeholder={m.recipes_meal_name_placeholder()}
				aria-label={m.recipes_meal_name_aria()}
				bind:value={newMealTitle}
			/>
			<input
				type="search"
				class="ui-field mb-2 w-full"
				placeholder={m.recipes_search_combine_placeholder()}
				aria-label={m.recipes_search_combine_aria()}
				bind:value={newMealQuery}
			/>
			<div class="flex-1 overflow-y-auto min-h-0 mb-3">
				<ul class="divide-y divide-base-200">
					{#each mealCandidates as c (c.slug)}
						<li>
							<label class="flex items-center gap-2.5 px-1 py-2 cursor-pointer">
								<input
									type="checkbox"
									class="checkbox checkbox-sm checkbox-primary"
									checked={newMealSlugs.includes(c.slug)}
									onchange={() => toggleMealSlug(c.slug)}
								/>
								<span class="text-sm flex-1 min-w-0 truncate"
									>{data.recipeLang === 'en' ? (c.titleEn ?? c.title) : c.title}</span
								>
							</label>
						</li>
					{:else}
						<li class="px-1 py-6 text-center text-xs text-base-content/45">
							{newMealQuery.trim() ? m.recipes_no_match_combine({ query: newMealQuery.trim() }) : m.recipes_no_recipes_to_combine()}
						</li>
					{/each}
				</ul>
			</div>
			{#if newMealError}
				<p class="text-xs text-error mb-2">{newMealError}</p>
			{/if}
			<div>
				<button
					class="ui-action ui-action-primary w-full"
					disabled={newMealLoading || newMealSlugs.length < 2 || !newMealTitle.trim()}
					onclick={createMeal}
				>
					{#if newMealLoading}<Spinner size="xs" />{/if}
					{m.recipes_combine_button()} {newMealSlugs.length >= 2 ? newMealSlugs.length : ''}
				</button>
			</div>
	</div>
</BottomSheet>

<BottomSheet bind:open={scrapeOpen} title={m.recipes_import_sheet_title()}>
			<input
				type="url"
				inputmode="url"
				class="ui-field mb-2 w-full"
				placeholder="https://www.ah.nl/allerhande/…"
				aria-label={m.recipes_url_aria()}
				bind:value={scrapeUrl}
				onkeydown={(e) => { if (e.key === 'Enter') scrape(); }}
			/>
			{#if scrapeError}
				<p class="text-sm text-error mb-2">{scrapeError}</p>
			{/if}
			<div class="mt-3">
				<button
					class="ui-action ui-action-primary w-full"
					onclick={scrape}
					disabled={!scrapeUrl.trim() || scrapeLoading}
				>
					{#if scrapeLoading}
						<Spinner size="sm" />
						{m.recipes_fetching_label()}
					{:else}
						<Icon name="plus" class="h-4 w-4" />
						{m.recipes_import_button()}
					{/if}
				</button>
			</div>
</BottomSheet>
