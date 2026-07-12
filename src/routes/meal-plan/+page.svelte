<script lang="ts">
	import { base } from '$app/paths';
	import { onMount, untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import { slide } from 'svelte/transition';
	import FreezePortionsModal from '$lib/components/FreezePortionsModal.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { optimistic } from '$lib/optimistic';
	import { toast } from '$lib/stores/toast.svelte';
	import { todayIso, APP_TIME_ZONE } from '$lib/week';
	import type { PageData } from './$types';

	type Meal = PageData['weeks'][number]['meals'][number];
	type Week = PageData['weeks'][number];
	type Recipe = PageData['recipeList'][number];

	let { data }: { data: PageData } = $props();

	let weeks = $state<Week[]>(untrack(() => data.weeks.map((w) => ({ ...w, meals: w.meals.map((m) => ({ ...m })) }))));
	const currentWeekStart = untrack(() => data.currentWeekStart);

	// "Show past weeks" / "Hide past weeks" (?past=1) is a same-route navigation
	// -- load reruns and data.weeks gets a fresh identity, but local `weeks`
	// (which carries optimistic add/toggle/remove edits) does not resync on its
	// own. Resync whenever a new load result arrives; server truth wins. Ids for
	// already-persisted meals are stable across resyncs, so in-flight optimistic
	// toggles/removes still land correctly via updateMeal/removeMealFromState;
	// an in-flight add whose temp id gets wiped falls back to addMealToState
	// once the real save resolves.
	$effect(() => {
		const next = data.weeks;
		weeks = next.map((w) => ({ ...w, meals: w.meals.map((m) => ({ ...m })) }));
	});

	let drawerOpen = $state(false);
	let drawerWeek = $state('');
	let drawerSearch = $state('');
	let drawerCategory = $state('');
	let drawerSubmitting = $state(false);

	let suggestActive = $state<string | null>(null);
	let suggestText = $state('');
	let suggestLoading = $state(false);
	let suggestError = $state('');
	let applyingSuggestion = $state<Record<string, boolean>>({});
	// Suggestions already planned this session — the Add button flips to a ✓ so
	// a second tap can't double-plan the same line (B2).
	let addedSuggestions = $state<Record<string, boolean>>({});
	let pendingAdds = $state<Record<string, boolean>>({});
	let pendingToggles = $state<Record<number, boolean>>({});
	let pendingDeletes = $state<Record<number, boolean>>({});
	let tempMealId = -1;

	let freezeOpen = $state(false);
	let freezeSlug = $state('');
	let freezeTitle = $state('');
	let freezeDefault = $state(2);

	const DRAWER_CATEGORIES = ['meat', 'vegetarian', 'vegan', 'fish', 'pasta', 'soup', 'dessert'];

	let freezerRecipes = $derived(
		[...data.recipeList]
			.filter((recipe) => recipe.onHandPortions > 0)
			.sort((a, b) => b.onHandPortions - a.onHandPortions || recipeDisplayTitle(a).localeCompare(recipeDisplayTitle(b)))
	);

	let filteredFreezerRecipes = $derived(
		freezerRecipes
			.filter((recipe) => recipeMatchesDrawer(recipe))
			.slice(0, 12)
	);

	let filteredRecipes = $derived(
		data.recipeList
			.filter((recipe) => recipeMatchesDrawer(recipe))
			.slice(0, 40)
	);

	let suggestLines = $derived(
		suggestText
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => /^(\d+[\.)]|[-*])\s+.+/.test(line))
			.map((line) => line.replace(/^(\d+[\.)]|[-*])\s+/, '').trim())
			.filter(Boolean)
	);

	function recipeDisplayTitle(recipe: Recipe): string {
		return recipe.titleEn ?? recipe.title;
	}

	function recipeDisplayCategory(recipe: Recipe): string | null {
		return recipe.categoryEn ?? recipe.category;
	}

	function recipeMatchesDrawer(recipe: Recipe): boolean {
		const q = drawerSearch.trim().toLowerCase();
		const matchSearch =
			!q ||
			recipe.title.toLowerCase().includes(q) ||
			(recipe.titleEn?.toLowerCase().includes(q) ?? false);
		const c = drawerCategory.toLowerCase();
		const matchCat =
			!drawerCategory ||
			(recipe.category?.toLowerCase().includes(c) ?? false) ||
			(recipe.categoryEn?.toLowerCase().includes(c) ?? false);
		return matchSearch && matchCat;
	}

	function formatWeekRange(weekStartDate: string): string {
		const start = new Date(weekStartDate + 'T00:00:00');
		const end = new Date(weekStartDate + 'T00:00:00');
		end.setDate(end.getDate() + 6);
		const fmt = (d: Date) =>
			d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: APP_TIME_ZONE });
		return `${fmt(start)} - ${fmt(end)}`;
	}

	function cookedDateLabel(iso: string): string {
		return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			timeZone: APP_TIME_ZONE
		});
	}

	function addKey(weekStartDate: string, dinner: string, recipeSlug: string | null = null): string {
		return `${weekStartDate}:${recipeSlug ?? dinner.trim().toLowerCase()}`;
	}

	function setPendingAdd(key: string, pending: boolean) {
		const next = { ...pendingAdds };
		if (pending) next[key] = true;
		else delete next[key];
		pendingAdds = next;
	}

	function setApplyingSuggestion(key: string, pending: boolean) {
		const next = { ...applyingSuggestion };
		if (pending) next[key] = true;
		else delete next[key];
		applyingSuggestion = next;
	}

	function weekFor(weekStartDate: string): Week | undefined {
		return weeks.find((week) => week.weekStartDate === weekStartDate);
	}

	function cloneWeeks(value: Week[]): Week[] {
		return value.map((week) => ({ ...week, meals: week.meals.map((meal) => ({ ...meal })) }));
	}

	function updateMeal(updated: Meal) {
		for (const week of weeks) {
			const idx = week.meals.findIndex((meal) => meal.id === updated.id);
			if (idx !== -1) {
				week.meals[idx] = { ...updated };
				weeks = [...weeks];
				return;
			}
		}
	}

	function replaceMeal(tempId: number, saved: Meal) {
		for (const week of weeks) {
			const idx = week.meals.findIndex((meal) => meal.id === tempId);
			if (idx !== -1) {
				week.meals[idx] = { ...saved };
				weeks = [...weeks];
				return;
			}
		}
		addMealToState(saved);
	}

	function removeMealFromState(id: number) {
		for (const week of weeks) {
			const idx = week.meals.findIndex((meal) => meal.id === id);
			if (idx !== -1) {
				week.meals.splice(idx, 1);
				weeks = [...weeks];
				return;
			}
		}
	}

	function addMealToState(meal: Meal) {
		const week = weekFor(meal.weekStartDate);
		if (week) {
			week.meals.push(meal);
			week.meals.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
			weeks = [...weeks];
			return;
		}
		weeks = [
			...weeks,
			{ weekStartDate: meal.weekStartDate, weekNumber: meal.weekNumber, meals: [meal] }
		].sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate));
	}

	function openAddDrawer(weekStartDate: string) {
		drawerWeek = weekStartDate;
		drawerSearch = '';
		drawerCategory = '';
		drawerOpen = true;
	}

	// No success toast: the new row appearing in the week list IS the confirmation
	// (same contract as /shopping); errors still toast via optimistic().
	async function addMealOptimistic(input: { weekStartDate: string; dinner: string; recipeSlug?: string | null }, closeDrawer = true): Promise<boolean> {
		const dinner = input.dinner.trim();
		if (!dinner) return false;
		const week = weekFor(input.weekStartDate);
		if (!week) return false;
		const key = addKey(input.weekStartDate, dinner, input.recipeSlug ?? null);
		if (pendingAdds[key]) return false;

		setPendingAdd(key, true);
		drawerSubmitting = true;
		const tempId = tempMealId--;
		const optimisticMeal: Meal = {
			id: tempId,
			weekStartDate: input.weekStartDate,
			weekNumber: week.weekNumber,
			dinner,
			recipeSlug: input.recipeSlug ?? null,
			status: 'planned',
			cookedDate: null,
			note: null,
			sortOrder: week.meals.length,
			createdAt: new Date()
		};
		addMealToState(optimisticMeal);

		let saved: Meal | null = null;
		const ok = await optimistic(
			async () => {
				const res = await fetch(`${base}/api/meal-plan`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						weekStartDate: input.weekStartDate,
						dinner,
						recipeSlug: input.recipeSlug ?? null
					})
				});
				if (res.ok) saved = await res.json();
				return res;
			},
			() => removeMealFromState(tempId),
			'Could not add the meal.'
		);

		setPendingAdd(key, false);
		drawerSubmitting = false;
		if (!ok || !saved) return false;
		replaceMeal(tempId, saved);
		if (closeDrawer) drawerOpen = false;
		return true;
	}

	async function toggleCooked(meal: Meal) {
		if (pendingToggles[meal.id]) return;
		const newStatus = meal.status === 'cooked' ? 'planned' : 'cooked';
		const previous = { ...meal };
		const optimisticMeal: Meal = {
			...meal,
			status: newStatus,
			cookedDate: newStatus === 'cooked' ? (meal.cookedDate ?? todayIso()) : null
		};
		pendingToggles = { ...pendingToggles, [meal.id]: true };
		updateMeal(optimisticMeal);

		let saved: Meal | null = null;
		const ok = await optimistic(
			async () => {
				const res = await fetch(`${base}/api/meal-plan/${meal.id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ status: newStatus })
				});
				if (res.ok) saved = await res.json();
				return res;
			},
			() => updateMeal(previous),
			'Could not update the meal.'
		);
		const nextToggles = { ...pendingToggles };
		delete nextToggles[meal.id];
		pendingToggles = nextToggles;

		if (!ok || !saved) return;
		updateMeal(saved);
		if (newStatus === 'cooked' && meal.recipeSlug) {
			const recipe = data.recipeList.find((r) => r.slug === meal.recipeSlug);
			freezeSlug = meal.recipeSlug;
			freezeTitle = meal.dinner;
			freezeDefault = recipe?.targetPortions ?? recipe?.servings ?? 2;
			freezeOpen = true;
		}
	}

	async function restoreMeal(meal: Meal) {
		const key = addKey(meal.weekStartDate, meal.dinner, meal.recipeSlug);
		if (pendingAdds[key]) return;
		const tempId = tempMealId--;
		const restoredMeal: Meal = {
			...meal,
			id: tempId,
			status: 'planned',
			cookedDate: null
		};

		setPendingAdd(key, true);
		addMealToState(restoredMeal);

		let saved: Meal | null = null;
		const ok = await optimistic(
			async () => {
				const res = await fetch(`${base}/api/meal-plan`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						weekStartDate: meal.weekStartDate,
						dinner: meal.dinner,
						recipeSlug: meal.recipeSlug
					})
				});
				if (res.ok) saved = await res.json();
				return res;
			},
			() => removeMealFromState(tempId),
			'Could not restore the meal.'
		);

		setPendingAdd(key, false);
		if (!ok) return;
		if (!saved) {
			removeMealFromState(tempId);
			toast.error('Could not restore the meal.');
			return;
		}
		replaceMeal(tempId, saved);
	}

	async function removeMeal(meal: Meal) {
		if (pendingDeletes[meal.id]) return;
		const before = cloneWeeks(weeks);
		pendingDeletes = { ...pendingDeletes, [meal.id]: true };
		removeMealFromState(meal.id);
		const ok = await optimistic(
			() => fetch(`${base}/api/meal-plan/${meal.id}`, { method: 'DELETE' }),
			() => {
				weeks = before;
			},
			'Could not remove the meal.'
		);
		const nextDeletes = { ...pendingDeletes };
		delete nextDeletes[meal.id];
		pendingDeletes = nextDeletes;
		if (ok) toast.undo(`Removed ${meal.dinner}`, () => void restoreMeal(meal));
	}

	async function addMealFromRecipe(recipe: Recipe) {
		await addMealOptimistic({ weekStartDate: drawerWeek, dinner: recipeDisplayTitle(recipe), recipeSlug: recipe.slug });
	}

	// One input serves both jobs: it filters the recipe lists live, and the
	// dashed row below plans the typed text as a custom dinner (UX: two labeled
	// inputs collapsed into one — Hick).
	async function addCustomFromSearch() {
		const dinner = drawerSearch.trim();
		if (!dinner) return;
		await addMealOptimistic({ weekStartDate: drawerWeek, dinner });
	}

	async function startSuggest(weekStartDate: string) {
		suggestActive = weekStartDate;
		suggestText = '';
		suggestError = '';
		suggestLoading = true;

		const recipeLibrary = data.recipeList
			.slice(0, 60)
			.map((recipe) => recipeDisplayTitle(recipe))
			.join(', ');
		const freezerContext = data.freezerPromptSummary
			? `Freezer stock available: ${data.freezerPromptSummary}.`
			: 'No linked freezer meals are currently available.';

		try {
			const res = await fetch(`${base}/api/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message: `Suggest 5 meals for the week of ${weekStartDate}. Use this household context when useful: ${freezerContext} Recipe library: ${recipeLibrary}. Prefer meals that use available freezer portions or known recipes. Reply in English with only a numbered list of meal names, no explanation.`
				})
			});
			if (!res.ok || !res.body) throw new Error('no stream');
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buf = '';
			let doneReading = false;
			while (!doneReading) {
				const { done, value } = await reader.read();
				if (done) break;
				buf += decoder.decode(value, { stream: true });
				const lines = buf.split('\n');
				buf = lines.pop() ?? '';
				for (const line of lines) {
					if (!line.startsWith('data: ')) continue;
					const payload = line.slice(6);
					if (payload === '[DONE]') {
						doneReading = true;
						break;
					}
					try {
						const event = JSON.parse(payload);
						if (event.type === 'text') suggestText += event.text;
					} catch {
						// Ignore malformed stream chunks; the next chunk may complete cleanly.
					}
				}
			}
		} catch {
			suggestError = 'Could not fetch suggestions';
			toast.error('Could not fetch suggestions.');
		} finally {
			suggestLoading = false;
		}
	}

	function closeSuggest() {
		suggestActive = null;
		suggestText = '';
		suggestError = '';
	}

	async function applySuggestion(dinner: string) {
		if (!suggestActive) return;
		const key = addKey(suggestActive, dinner);
		if (applyingSuggestion[key] || addedSuggestions[key]) return;
		setApplyingSuggestion(key, true);
		const ok = await addMealOptimistic({ weekStartDate: suggestActive, dinner }, false);
		if (ok) addedSuggestions = { ...addedSuggestions, [key]: true };
		setApplyingSuggestion(key, false);
	}

	onMount(() => {
		const el = document.getElementById(`week-${currentWeekStart}`);
		el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	});
</script>

<svelte:head>
	<title>Meal plan · Household Brain</title>
</svelte:head>

<div class="ui-page-shell px-4 py-4">
	<header class="mb-3 flex items-center justify-between gap-3">
		<h1 class="min-w-0 text-2xl font-semibold leading-tight">Meal plan</h1>
		<a href="{base}/shopping?week={currentWeekStart}" class="btn btn-outline btn-sm shrink-0 gap-1.5">
			<Icon name="cart" />
			Shopping
		</a>
	</header>

	{#if data.hasPastWeeks || data.showPastWeeks}
		<div class="mb-3">
			{#if data.showPastWeeks}
				<a class="text-sm text-primary" href="{base}/meal-plan">Hide past weeks</a>
			{:else}
				<a class="text-sm text-primary" href="{base}/meal-plan?past=1">Show past weeks</a>
			{/if}
		</div>
	{/if}

	<div class="flex flex-col gap-4">
		{#each weeks as week (week.weekStartDate)}
			<section
				id="week-{week.weekStartDate}"
				class="ui-list-card {week.weekStartDate === currentWeekStart ? 'border-primary/60' : ''}"
			>
				<div class="border-b border-base-200 px-3 py-3">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<div class="flex items-center gap-2">
								<h2 class="text-sm font-semibold">Week {week.weekNumber}</h2>
								{#if week.weekStartDate === currentWeekStart}
									<span class="ui-chip-active">Now</span>
								{/if}
							</div>
							<p class="mt-0.5 text-xs text-base-content/50">{formatWeekRange(week.weekStartDate)}</p>
						</div>
						<div class="flex shrink-0 gap-1.5">
							<a
								href="{base}/shopping?week={week.weekStartDate}"
								class="btn btn-outline btn-sm h-9 min-h-0 w-9 px-0"
								aria-label={`Open shopping list for week ${week.weekNumber}`}
							>
								<Icon name="cart" />
							</a>
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								onclick={() => startSuggest(week.weekStartDate)}
								disabled={suggestLoading && suggestActive === week.weekStartDate}
							>
								{suggestLoading && suggestActive === week.weekStartDate ? 'Thinking…' : 'Suggest'}
							</button>
							<button
								type="button"
								class="btn btn-primary btn-sm h-9 min-h-0 w-9 px-0"
								onclick={() => openAddDrawer(week.weekStartDate)}
								aria-label="Add meal"
							>
								<Icon name="plus" />
							</button>
						</div>
					</div>
				</div>

				{#if week.meals.length > 0}
					<ul class="divide-y divide-base-200">
						{#each week.meals as meal (meal.id)}
							<li
								class="flex min-h-14 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-base-200/60"
								transition:slide={{ duration: 150 }}
								animate:flip={{ duration: 200 }}
							>
								<label class="-m-2 flex shrink-0 cursor-pointer items-center p-2">
									<input
										type="checkbox"
										class="checkbox checkbox-md"
										checked={meal.status === 'cooked'}
										disabled={!!pendingToggles[meal.id]}
										aria-label={`Mark ${meal.dinner} cooked`}
										onchange={() => toggleCooked(meal)}
									/>
								</label>
								<div class="min-w-0 flex-1">
									{#if meal.recipeSlug}
										<a
											href="{base}/recipes/{meal.recipeSlug}"
											class="block truncate text-sm font-medium {meal.status === 'cooked' ? 'text-base-content/40 line-through' : ''}"
										>
											{meal.dinner}
										</a>
									{:else}
										<span class="block truncate text-sm font-medium {meal.status === 'cooked' ? 'text-base-content/40 line-through' : ''}">
											{meal.dinner}
										</span>
									{/if}
									{#if meal.cookedDate && meal.status === 'cooked'}
										<span class="mt-1 inline-flex items-center gap-1 text-xs text-base-content/35">
											<Icon name="check" class="h-3 w-3" />
											{cookedDateLabel(meal.cookedDate)}
										</span>
									{/if}
								</div>
								<button
									type="button"
									class="btn btn-ghost btn-sm h-10 min-h-0 w-10 shrink-0 px-0 text-error"
									onclick={() => removeMeal(meal)}
									disabled={!!pendingDeletes[meal.id]}
									aria-label={`Remove ${meal.dinner}`}
								>
									<Icon name="trash" />
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<div class="p-3">
						<EmptyState mini title="No meals yet">
							{#snippet action()}
								<button type="button" class="btn btn-primary btn-xs" onclick={() => openAddDrawer(week.weekStartDate)}>
									Add meal
								</button>
							{/snippet}
						</EmptyState>
					</div>
				{/if}

				{#if suggestActive === week.weekStartDate}
					<div class="border-t border-base-200 bg-base-200/35 px-3 py-3" transition:slide={{ duration: 180 }}>
						<div class="mb-2 flex items-center justify-between gap-2">
							<p class="ui-section-label">AI suggestions</p>
							<button type="button" class="btn btn-ghost btn-xs" onclick={closeSuggest}>
								Close
							</button>
						</div>
						{#if suggestLoading}
							<div class="flex items-center gap-2 py-2 text-sm text-base-content/60">
								<span class="loading loading-dots loading-xs"></span>
								Thinking…
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
								Retry
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
												Planned
											</span>
										{:else}
											<button
												type="button"
												class="btn btn-primary btn-xs"
												onclick={() => applySuggestion(suggestion)}
												disabled={!!applyingSuggestion[key] || !!pendingAdds[key]}
											>
												Add
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
		{/each}
	</div>
</div>

<BottomSheet bind:open={drawerOpen} title="Add meal">
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
			placeholder="Search recipes or type a dinner…"
			aria-label="Search recipes or type a custom dinner"
			autocomplete="off"
			bind:value={drawerSearch}
		/>
	</form>

	<div class="mt-3 flex flex-wrap gap-1.5">
		{#each DRAWER_CATEGORIES as cat}
			<button
				type="button"
				class={drawerCategory === cat ? 'ui-chip-active' : 'ui-chip'}
				aria-pressed={drawerCategory === cat}
				onclick={() => (drawerCategory = drawerCategory === cat ? '' : cat)}
			>
				{cat}
			</button>
		{/each}
	</div>

	{#if drawerSearch.trim()}
		<button
			type="button"
			class="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-base-300 px-3 py-2.5 text-left transition-colors hover:bg-base-200/60 disabled:opacity-50"
			onclick={addCustomFromSearch}
			disabled={drawerSubmitting}
			transition:slide={{ duration: 150 }}
		>
			<span class="min-w-0 flex-1 truncate text-sm">Plan “{drawerSearch.trim()}”</span>
			<span class="ui-chip-muted shrink-0">custom</span>
		</button>
	{/if}

	{#if freezerRecipes.length > 0}
		<section class="mt-5">
			<div class="mb-2 flex items-baseline justify-between gap-3">
				<h3 class="ui-section-label">From your freezer</h3>
				<span class="ui-chip-muted">{freezerRecipes.length} stocked</span>
			</div>
			{#if filteredFreezerRecipes.length > 0}
				<ul class="ui-list-card divide-y divide-base-200">
					{#each filteredFreezerRecipes as recipe}
						{@const title = recipeDisplayTitle(recipe)}
						{@const key = addKey(drawerWeek, title, recipe.slug)}
						<li>
							<button
								type="button"
								class="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-base-200/60 disabled:opacity-50"
								onclick={() => addMealFromRecipe(recipe)}
								disabled={drawerSubmitting || !!pendingAdds[key]}
							>
								<span class="min-w-0">
									<span class="block truncate text-sm font-medium">{title}</span>
									<span class="text-xs text-base-content/45">
										{recipe.onHandPortions} portion{recipe.onHandPortions === 1 ? '' : 's'} ready
									</span>
								</span>
								<span class="ui-chip-active shrink-0">Plan</span>
							</button>
						</li>
					{/each}
				</ul>
			{:else}
				<EmptyState mini title="No freezer matches" description="Clear the search or category filter." />
			{/if}
		</section>
	{/if}

	<section class="mt-5">
		<h3 class="ui-section-label mb-2">Recipe library</h3>
		{#if filteredRecipes.length === 0}
			<EmptyState mini title="No recipes found" description="Try a different search or category." />
		{:else}
			<ul class="ui-list-card divide-y divide-base-200">
				{#each filteredRecipes as recipe}
					{@const title = recipeDisplayTitle(recipe)}
					{@const cat = recipeDisplayCategory(recipe)}
					{@const key = addKey(drawerWeek, title, recipe.slug)}
					<li>
						<button
							type="button"
							class="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-base-200/60 disabled:opacity-50"
							onclick={() => addMealFromRecipe(recipe)}
							disabled={drawerSubmitting || !!pendingAdds[key]}
						>
							<span class="min-w-0">
								<span class="block truncate text-sm font-medium">{title}</span>
								{#if cat}
									<span class="text-xs text-base-content/45">{cat}</span>
								{/if}
							</span>
							{#if recipe.onHandPortions > 0}
								<span class="ui-chip-active shrink-0">{recipe.onHandPortions} in freezer</span>
							{:else}
								<Icon name="plus" class="h-4 w-4 shrink-0 text-base-content/35" />
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</BottomSheet>

<FreezePortionsModal bind:open={freezeOpen} slug={freezeSlug} title={freezeTitle} defaultPortions={freezeDefault} />
