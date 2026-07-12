<script lang="ts">
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { CORE_FOOD_TYPE_OPTIONS, foodCategoryLabel } from '$lib/food_categories';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import { fade } from 'svelte/transition';

	type Recipe = {
		id: number;
		slug: string;
		title: string;
		titleEn: string | null;
		category: string | null;
		categoryEn: string | null;
		rating: number | null;
		totalTimeMin: number | null;
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
	};

	type Toggles = {
		haveAll: boolean;
		freezerOnly: boolean;
		belowTargetOnly: boolean;
		quickOnly: boolean;
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
		};
	} = $props();

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
				newMealError = body.message ?? 'Could not create the meal';
				toast.error(newMealError);
			} else {
				newMealOpen = false;
				await goto(`${base}/recipes/${body.slug}`);
			}
		} catch {
			newMealError = 'Connection error';
			toast.error(newMealError);
		}
		newMealLoading = false;
	}

	type ToggleName = keyof Toggles;

	// data.toggles uses JS names; the URL contract uses short param names.
	const TOGGLE_PARAM: Record<ToggleName, 'have' | 'freezer' | 'below' | 'quick'> = {
		haveAll: 'have',
		freezerOnly: 'freezer',
		belowTargetOnly: 'below',
		quickOnly: 'quick'
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
		quick?: boolean;
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
		const nextQuick = overrides.quick ?? data.toggles.quickOnly;
		if (nextQ) params.set('q', nextQ);
		if (nextSort !== 'title') params.set('sort', nextSort);
		if (nextClass) params.set('class', nextClass);
		if (nextDish) params.set('dish', nextDish);
		if (nextIngredient) params.set('ingredient', nextIngredient);
		if (nextHave) params.set('have', '1');
		if (nextFreezer) params.set('freezer', '1');
		if (nextBelow) params.set('below', '1');
		if (nextQuick) params.set('quick', '1');
		const qs = params.toString();
		return `${base}/recipes${qs ? '?' + qs : ''}`;
	}

	function search() {
		goto(recipeHref());
	}

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
			data.toggles.belowTargetOnly ||
			data.toggles.quickOnly
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
		goto(recipeHref({ q: '', sort: 'title', class: '', dish: '', ingredient: '', have: false, freezer: false, below: false, quick: false }));
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
				scrapeError = body.message ?? body.error ?? 'Scraping failed';
				toast.error(scrapeError);
			} else {
				scrapeOpen = false;
				scrapeUrl = '';
				goto(`${base}/recipes/${body.slug}`);
			}
		} catch {
			scrapeError = 'Connection error';
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
			return recipe.cookedCount > 0 ? `${recipe.cookedCount}× cooked` : 'never cooked';
		}
		if (!recipe.lastCookedAt) return 'never cooked';
		const t = recipe.lastCookedAt instanceof Date ? recipe.lastCookedAt.getTime() : new Date(recipe.lastCookedAt).getTime();
		const days = Math.floor((Date.now() - t) / 86_400_000);
		if (days <= 0) return 'cooked today';
		if (days === 1) return 'cooked yesterday';
		if (days < 14) return `cooked ${days}d ago`;
		if (days < 60) return `cooked ${Math.floor(days / 7)}w ago`;
		return `cooked ${Math.floor(days / 30)}mo ago`;
	}

	function coverageLabel(recipe: Recipe): string | null {
		if (recipe.ingredientTotal <= 0) return null;
		if (recipe.hasAllIngredients) return 'have all';
		if (recipe.coverage > 0) return `${recipe.coverage}/${recipe.ingredientTotal} on hand`;
		return null;
	}
</script>

<svelte:head>
	<title>Recipes · Household Brain</title>
</svelte:head>

<div class="ui-page-shell px-4 py-4">
	<header class="mb-3 flex items-center justify-between gap-3">
		<h1 class="min-w-0 text-2xl font-semibold leading-tight">Recipes</h1>
		<div class="flex shrink-0 gap-2">
			<button
				class="btn btn-sm btn-ghost border border-base-300"
				onclick={() => {
					newMealOpen = true;
					newMealTitle = '';
					newMealQuery = '';
					newMealSlugs = [];
					newMealError = '';
				}}>+ Meal</button
			>
			<button class="btn btn-sm btn-primary" onclick={() => { scrapeOpen = true; }}>Import</button>
		</div>
	</header>

	<!-- Sticky filter bar. Chips toggle: tap the active chip to clear it (same
	     contract as the /inventory facet bar) — no "All" chips, no group labels,
	     rows scroll horizontally on 375px instead of wrapping. -->
	<section class="sticky top-0 z-20 -mx-4 mb-4 border-y border-base-200 bg-base-100/95 px-4 py-2 backdrop-blur">
		<div class="mb-2 flex gap-2">
			<input
				type="search"
				class="input input-bordered input-sm flex-1"
				placeholder="Search by name or ingredient..."
				aria-label="Search recipes by name or ingredient"
				bind:value={searchInput}
				onkeydown={(e) => { if (e.key === 'Enter') search(); }}
			/>
			<select class="select select-bordered select-sm w-36 shrink-0" bind:value={sortBy} onchange={search} aria-label="Sort recipes">
				<option value="title">A-Z</option>
				<option value="rating">Rating</option>
				<option value="recent">Recently cooked</option>
				<option value="neglected">Neglected</option>
				<option value="most-cooked">Most cooked</option>
			</select>
		</div>
		<div class="flex items-center gap-1.5 overflow-x-auto pb-0.5">
			{#each CORE_FOOD_TYPE_OPTIONS as option}
				<button
					type="button"
					class={classFilter === option.value ? 'ui-chip-active shrink-0' : 'ui-chip shrink-0'}
					aria-pressed={classFilter === option.value}
					onclick={() => setClass(option.value)}
				>{option.label}</button>
			{/each}
			{#if data.dishTypes.length}
				<span class="h-4 w-px shrink-0 bg-base-300" aria-hidden="true"></span>
			{/if}
			{#each data.dishTypes as dishType}
				<button
					type="button"
					class={dishFilter === dishType ? 'ui-chip-active shrink-0' : 'ui-chip shrink-0'}
					aria-pressed={dishFilter === dishType}
					onclick={() => setDish(dishType)}
				>{foodCategoryLabel(dishType) ?? dishType}</button>
			{/each}
		</div>
		<div class="mt-1.5 flex items-center gap-1.5 overflow-x-auto pb-0.5">
			<button
				type="button"
				class={data.toggles.haveAll ? 'ui-chip-active shrink-0 border-success/40 bg-success/10 text-success' : 'ui-chip shrink-0'}
				aria-pressed={data.toggles.haveAll}
				onclick={() => toggle('haveAll')}
			>Have all</button>
			<button
				type="button"
				class={data.toggles.freezerOnly ? 'ui-chip-active shrink-0 border-info/40 bg-info/10 text-info' : 'ui-chip shrink-0'}
				aria-pressed={data.toggles.freezerOnly}
				onclick={() => toggle('freezerOnly')}
			>Freezer staple</button>
			<button
				type="button"
				class={data.toggles.belowTargetOnly ? 'ui-chip-active shrink-0 border-warning/40 bg-warning/10 text-warning' : 'ui-chip shrink-0'}
				aria-pressed={data.toggles.belowTargetOnly}
				onclick={() => toggle('belowTargetOnly')}
			>Below target</button>
			<button
				type="button"
				class={data.toggles.quickOnly ? 'ui-chip-active shrink-0' : 'ui-chip shrink-0'}
				aria-pressed={data.toggles.quickOnly}
				onclick={() => toggle('quickOnly')}
			>Quick &lt;30m</button>
		</div>
	</section>

	{#if ingredientFilter}
		<div class="mb-3 flex items-center gap-2 rounded-xl border border-base-300 bg-base-200 px-3 py-2 text-sm">
			<span class="min-w-0 flex-1 truncate">Recipes using <strong>{ingredientFilter}</strong></span>
			<button class="btn btn-xs btn-ghost" onclick={clearIngredientFilter}>Clear</button>
		</div>
	{/if}

	<!-- Grid -->
	{#if data.recipes.length === 0}
		<EmptyState
			icon="📖"
			title={hasActiveFilters ? 'No recipes found' : 'No recipes yet'}
			description={hasActiveFilters ? 'Try another class, dish type, toggle, or search term.' : 'Import a recipe URL to start the cookbook.'}
		>
			{#snippet action()}
				{#if hasActiveFilters}
					<button class="btn btn-sm btn-ghost border border-base-300" onclick={clearFilters}>Clear filters</button>
				{:else}
					<button class="btn btn-sm btn-primary" onclick={() => (scrapeOpen = true)}>Import recipe</button>
				{/if}
			{/snippet}
		</EmptyState>
	{:else}
		<div class="grid grid-cols-2 gap-3">
			{#each data.recipes as recipe (recipe.id)}
				{@const title = displayTitle(recipe)}
				{@const category = displayCategory(recipe)}
				{@const cookedLabel = lastCookedLabel(recipe)}
				{@const coverage = coverageLabel(recipe)}
				<a
					href="{base}/recipes/{recipe.slug}"
					class="ui-list-card block hover:border-primary transition-colors"
					animate:flip={{ duration: 200 }}
					in:fade={{ duration: 150 }}
				>
					{#if recipe.imageUrl}
						<figure class="h-28 overflow-hidden">
							<img src={recipe.imageUrl} alt={title} class="w-full h-full object-cover" loading="lazy" />
						</figure>
					{:else}
						<div class="h-28 bg-base-200 flex items-center justify-center text-3xl">🍽️</div>
					{/if}
					<div class="p-2">
						<h2 class="text-sm font-semibold leading-snug line-clamp-2 mb-1">{title}</h2>
						<div class="flex items-center justify-between gap-1">
							{#if category}
								<span class="ui-chip-muted max-w-24 truncate px-2 py-0.5">{category}</span>
							{:else}
								<span></span>
							{/if}
							{#if recipe.rating}
								<span class="text-xs text-warning shrink-0">{stars(recipe.rating)}</span>
							{/if}
						</div>
						<div class="flex items-center justify-between text-xs text-base-content/40 mt-0.5">
							{#if recipe.totalTimeMin}
								<span>⏱ {recipe.totalTimeMin} min</span>
							{:else}
								<span></span>
							{/if}
							{#if cookedLabel}
								<span class="truncate ml-1">{cookedLabel}</span>
							{/if}
						</div>
						{#if recipe.needsReview || coverage || recipe.belowTarget || recipe.isFreezerStaple || recipe.subCount > 0}
							<div class="flex flex-wrap gap-1 mt-1">
								{#if recipe.subCount > 0}
									<span class="ui-chip-muted px-2 py-0.5">meal · {recipe.subCount}</span>
								{/if}
								{#if recipe.needsReview}
									<span class="ui-chip-active border-warning/40 bg-warning/10 px-2 py-0.5 text-warning">review</span>
								{/if}
								{#if coverage}
									<span class={recipe.hasAllIngredients ? 'ui-chip-active border-success/40 bg-success/10 px-2 py-0.5 text-success' : 'ui-chip-muted px-2 py-0.5'}>{coverage}</span>
								{/if}
								{#if recipe.belowTarget}
									<span class="ui-chip-active border-warning/40 bg-warning/10 px-2 py-0.5 text-warning">below target</span>
								{:else if recipe.isFreezerStaple}
									<span class="ui-chip-muted px-2 py-0.5">freezer</span>
								{/if}
							</div>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>

<BottomSheet bind:open={newMealOpen} title="New meal">
	<div class="flex max-h-[62dvh] flex-col">
			<input
				type="text"
				class="input input-bordered input-sm w-full mb-2"
				placeholder="Meal name, e.g. Taco night"
				aria-label="Meal name"
				bind:value={newMealTitle}
			/>
			<input
				type="search"
				class="input input-bordered input-sm w-full mb-2"
				placeholder="Search recipes to combine…"
				aria-label="Search recipes to combine"
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
							{newMealQuery.trim() ? `No recipes match “${newMealQuery.trim()}”` : 'No recipes to combine yet'}
						</li>
					{/each}
				</ul>
			</div>
			{#if newMealError}
				<p class="text-xs text-error mb-2">{newMealError}</p>
			{/if}
			<div class="flex justify-end gap-2">
				<button class="btn btn-ghost btn-sm" onclick={() => (newMealOpen = false)}>Cancel</button>
				<button
					class="btn btn-primary btn-sm"
					disabled={newMealLoading || newMealSlugs.length < 2 || !newMealTitle.trim()}
					onclick={createMeal}
				>
					{#if newMealLoading}<span class="loading loading-spinner loading-xs"></span>{/if}
					Combine {newMealSlugs.length >= 2 ? newMealSlugs.length : ''}
				</button>
			</div>
	</div>
</BottomSheet>

<BottomSheet bind:open={scrapeOpen} title="Import recipe from URL">
			<input
				type="url"
				inputmode="url"
				class="input input-bordered w-full mb-2"
				placeholder="https://www.ah.nl/allerhande/…"
				aria-label="Recipe URL"
				bind:value={scrapeUrl}
				onkeydown={(e) => { if (e.key === 'Enter') scrape(); }}
			/>
			{#if scrapeError}
				<p class="text-sm text-error mb-2">{scrapeError}</p>
			{/if}
			<div class="flex justify-end gap-2 mt-3">
				<button class="btn btn-ghost" onclick={() => { scrapeOpen = false; }}>Cancel</button>
				<button
					class="btn btn-primary"
					onclick={scrape}
					disabled={!scrapeUrl.trim() || scrapeLoading}
				>
					{#if scrapeLoading}
						<span class="loading loading-spinner loading-sm"></span>
						Fetching recipe…
					{:else}
						<Icon name="plus" class="h-4 w-4" />
						Import
					{/if}
				</button>
			</div>
</BottomSheet>
