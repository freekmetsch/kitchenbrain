<script lang="ts">
	import { base } from '$app/paths';
	import { onMount, untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import { slide } from 'svelte/transition';
	import { invalidateAll } from '$app/navigation';
	import ConsumePortionsModal from '$lib/components/ConsumePortionsModal.svelte';
	import FreezePortionsModal from '$lib/components/FreezePortionsModal.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { optimistic } from '$lib/optimistic';
	import { toast } from '$lib/stores/toast.svelte';
	import { addDays, dateOfWeekday, todayIso, APP_TIME_ZONE } from '$lib/week';
	import { weekdayName } from '$lib/weekday';
	import { m } from '$lib/paraglide/messages';
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

	const prefs = untrack(() => data.mealPlanPrefs);
	const dayPlanning = prefs.dayPlanning;

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

	let consumeOpen = $state(false);
	let consumeSlug = $state('');
	let consumeTitle = $state('');
	let consumeDefault = $state(2);
	let consumeMax = $state(99);
	let pendingSourceToggles = $state<Record<number, boolean>>({});

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

	function recipeForMeal(meal: Meal): Recipe | undefined {
		return meal.recipeSlug ? data.recipeList.find((r) => r.slug === meal.recipeSlug) : undefined;
	}

	/** Frozen portions on hand for the meal's linked recipe (0 when unlinked). */
	function frozenPortionsFor(meal: Meal): number {
		return recipeForMeal(meal)?.onHandPortions ?? 0;
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

	function deliveryLabel(iso: string): string {
		return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			timeZone: APP_TIME_ZONE
		});
	}

	// Day-to-day planning: the seven dates of a week, offered by the per-meal
	// day picker. Day-planned meals sort to their day; pool meals sink below.
	function weekDayOptions(weekStartDate: string): { date: string; label: string }[] {
		return Array.from({ length: 7 }, (_, i) => {
			const date = addDays(weekStartDate, i);
			return { date, label: weekdayName((prefs.weekStartDay + i) % 7, 'short') };
		});
	}

	function displayMeals(week: Week): Meal[] {
		if (!dayPlanning) return week.meals;
		return [...week.meals].sort(
			(a, b) =>
				(a.plannedDate ?? '9999-99-99').localeCompare(b.plannedDate ?? '9999-99-99') ||
				a.sortOrder - b.sortOrder ||
				a.id - b.id
		);
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
			{
				weekStartDate: meal.weekStartDate,
				weekNumber: meal.weekNumber,
				deliveryDate:
					prefs.groceryDay == null ? null : dateOfWeekday(meal.weekStartDate, prefs.groceryDay, prefs.weekStartDay),
				meals: [meal]
			}
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
	async function addMealOptimistic(
		input: { weekStartDate: string; dinner: string; recipeSlug?: string | null; source?: 'fresh' | 'freezer' },
		closeDrawer = true
	): Promise<boolean> {
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
			source: input.source ?? 'fresh',
			cookedDate: null,
			plannedDate: null,
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
						recipeSlug: input.recipeSlug ?? null,
						source: input.source ?? 'fresh'
					})
				});
				if (res.ok) saved = await res.json();
				return res;
			},
			() => removeMealFromState(tempId),
			m.mealplan_toast_could_not_add()
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
			m.mealplan_toast_could_not_update()
		);
		const nextToggles = { ...pendingToggles };
		delete nextToggles[meal.id];
		pendingToggles = nextToggles;

		if (!ok || !saved) return;
		updateMeal(saved);
		if (newStatus === 'cooked' && meal.recipeSlug) {
			const recipe = recipeForMeal(meal);
			if (meal.source === 'freezer') {
				// Served from the freezer: take the portions OUT of stock instead of
				// prompting to freeze more of what was just defrosted.
				const onHand = recipe?.onHandPortions ?? 0;
				if (onHand > 0) {
					consumeSlug = meal.recipeSlug;
					consumeTitle = meal.dinner;
					consumeMax = onHand;
					consumeDefault = Math.min(onHand, recipe?.servings ?? 2);
					consumeOpen = true;
				} else {
					toast.error(m.mealplan_toast_no_frozen_portions({ dinner: meal.dinner }));
				}
			} else {
				freezeSlug = meal.recipeSlug;
				freezeTitle = meal.dinner;
				freezeDefault = recipe?.targetPortions ?? recipe?.servings ?? 2;
				freezeOpen = true;
			}
		}
	}

	// Fresh ↔ freezer service toggle on a planned meal. Server rejects freezer
	// for recipe-less meals; the chip only renders for linked ones anyway.
	async function toggleSource(meal: Meal) {
		if (pendingSourceToggles[meal.id] || meal.id < 0) return;
		const newSource = meal.source === 'freezer' ? 'fresh' : 'freezer';
		const previous = { ...meal };
		pendingSourceToggles = { ...pendingSourceToggles, [meal.id]: true };
		updateMeal({ ...meal, source: newSource });

		let saved: Meal | null = null;
		const ok = await optimistic(
			async () => {
				const res = await fetch(`${base}/api/meal-plan/${meal.id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ source: newSource })
				});
				if (res.ok) saved = await res.json();
				return res;
			},
			() => updateMeal(previous),
			m.mealplan_toast_could_not_update()
		);
		const next = { ...pendingSourceToggles };
		delete next[meal.id];
		pendingSourceToggles = next;
		if (ok && saved) updateMeal(saved);
	}

	async function setPlannedDate(meal: Meal, plannedDate: string | null) {
		if (pendingToggles[meal.id]) return;
		const previous = { ...meal };
		pendingToggles = { ...pendingToggles, [meal.id]: true };
		updateMeal({ ...meal, plannedDate });

		let saved: Meal | null = null;
		const ok = await optimistic(
			async () => {
				const res = await fetch(`${base}/api/meal-plan/${meal.id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ plannedDate })
				});
				if (res.ok) saved = await res.json();
				return res;
			},
			() => updateMeal(previous),
			m.mealplan_toast_could_not_update()
		);
		const nextToggles = { ...pendingToggles };
		delete nextToggles[meal.id];
		pendingToggles = nextToggles;
		if (ok && saved) updateMeal(saved);
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
						recipeSlug: meal.recipeSlug,
						plannedDate: meal.plannedDate,
						source: meal.source
					})
				});
				if (res.ok) saved = await res.json();
				return res;
			},
			() => removeMealFromState(tempId),
			m.mealplan_toast_could_not_restore()
		);

		setPendingAdd(key, false);
		if (!ok) return;
		if (!saved) {
			removeMealFromState(tempId);
			toast.error(m.mealplan_toast_could_not_restore());
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
			m.mealplan_toast_could_not_remove()
		);
		const nextDeletes = { ...pendingDeletes };
		delete nextDeletes[meal.id];
		pendingDeletes = nextDeletes;
		if (ok) toast.undo(m.mealplan_toast_removed({ dinner: meal.dinner }), () => void restoreMeal(meal));
	}

	async function addMealFromRecipe(recipe: Recipe, source: 'fresh' | 'freezer' = 'fresh') {
		await addMealOptimistic({
			weekStartDate: drawerWeek,
			dinner: recipeDisplayTitle(recipe),
			recipeSlug: recipe.slug,
			source
		});
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
			? `Freezer stock available: ${data.freezerPromptSummary}. Meals served from the freezer only need their fresh sides bought that week (bread, rice, fresh garnishes), so they are cheap low-effort picks.`
			: 'No linked freezer meals are currently available.';
		// Rotation cycle (Settings → Meal planning): recently cooked meals are
		// off the table for this round.
		const rotationContext =
			prefs.repeatCycleDays > 0 && data.recentlyCookedSummary
				? ` Do NOT suggest these meals — they were cooked within the last ${prefs.repeatCycleDays} days: ${data.recentlyCookedSummary}.`
				: '';

		try {
			const res = await fetch(`${base}/api/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message: `Suggest ${prefs.suggestCount} meals for the week of ${weekStartDate}. Use this household context when useful: ${freezerContext} Recipe library: ${recipeLibrary}. Prefer meals that use available freezer portions or known recipes.${rotationContext} Reply in English with only a numbered list of meal names, no explanation.`
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
			suggestError = m.mealplan_toast_suggestions_failed();
			toast.error(m.mealplan_toast_suggestions_failed());
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
		// A ?week= deep link (e.g. from the shopping page) outranks the default
		// scroll-to-current-week behavior.
		const el = document.getElementById(`week-${data.focusWeek ?? currentWeekStart}`);
		el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	});
</script>

<svelte:head>
	<title>{m.mealplan_title()}</title>
</svelte:head>

<div class="ui-page-shell px-4 py-4">
	<header class="mb-3 flex items-center justify-between gap-3">
		<h1 class="min-w-0 text-2xl font-semibold leading-tight">{m.mealplan_heading()}</h1>
		<div class="flex shrink-0 items-center gap-1.5">
			<a href="{base}/shopping?week={currentWeekStart}" class="btn btn-outline btn-sm gap-1.5">
				<Icon name="cart" />
				{m.mealplan_shopping_link()}
			</a>
			<a
				href="{base}/settings/meal-plan"
				class="btn btn-ghost btn-sm h-9 min-h-0 w-9 px-0"
				aria-label={m.mealplan_settings_aria()}
			>
				<Icon name="settings" class="h-4 w-4" />
			</a>
		</div>
	</header>

	{#if data.hasPastWeeks || data.showPastWeeks}
		<div class="mb-3">
			{#if data.showPastWeeks}
				<a class="text-sm text-primary" href="{base}/meal-plan">{m.mealplan_hide_past_weeks()}</a>
			{:else}
				<a class="text-sm text-primary" href="{base}/meal-plan?past=1">{m.mealplan_show_past_weeks()}</a>
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
								<h2 class="text-sm font-semibold">{m.mealplan_week_heading({ number: week.weekNumber })}</h2>
								{#if week.weekStartDate === currentWeekStart}
									<span class="ui-chip-active">{m.mealplan_now_chip()}</span>
								{/if}
							</div>
							<p class="mt-0.5 text-xs text-base-content/50">{formatWeekRange(week.weekStartDate)}</p>
							{#if week.deliveryDate}
								<p class="mt-0.5 inline-flex items-center gap-1 text-xs text-base-content/50">
									<Icon name="cart" class="h-3 w-3" />
									{m.mealplan_delivery_label({ date: deliveryLabel(week.deliveryDate) })}
								</p>
							{/if}
						</div>
						<div class="flex shrink-0 gap-1.5">
							<a
								href="{base}/shopping?week={week.weekStartDate}"
								class="btn btn-outline btn-sm h-9 min-h-0 w-9 px-0"
								aria-label={m.mealplan_open_shopping_aria({ number: week.weekNumber })}
							>
								<Icon name="cart" />
							</a>
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								onclick={() => startSuggest(week.weekStartDate)}
								disabled={suggestLoading && suggestActive === week.weekStartDate}
							>
								{suggestLoading && suggestActive === week.weekStartDate ? m.mealplan_thinking_label() : m.mealplan_suggest_button()}
							</button>
							<button
								type="button"
								class="btn btn-primary btn-sm h-9 min-h-0 w-9 px-0"
								onclick={() => openAddDrawer(week.weekStartDate)}
								aria-label={m.mealplan_add_meal()}
							>
								<Icon name="plus" />
							</button>
						</div>
					</div>
				</div>

				{#if week.meals.length > 0}
					<ul class="divide-y divide-base-200">
						{#each displayMeals(week) as meal (meal.id)}
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
										aria-label={m.mealplan_mark_cooked_aria({ dinner: meal.dinner })}
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
									{#if meal.status !== 'cooked' && meal.recipeSlug && (meal.source === 'freezer' || frozenPortionsFor(meal) > 0)}
										{@const onHand = frozenPortionsFor(meal)}
										<!-- Fresh ↔ freezer service toggle: only rendered when the choice
										     exists (portions on hand, or already set to freezer). -->
										<button
											type="button"
											class="mt-1 {meal.source === 'freezer'
												? onHand > 0
													? 'ui-chip-active'
													: 'ui-chip border-warning/50 bg-warning/10 text-warning'
												: 'ui-chip'}"
											disabled={!!pendingSourceToggles[meal.id] || meal.id < 0}
											aria-pressed={meal.source === 'freezer'}
											aria-label={m.mealplan_source_toggle_aria({ dinner: meal.dinner })}
											onclick={() => toggleSource(meal)}
										>
											{#if meal.source === 'freezer'}
												{onHand > 0
													? `❄️ ${m.mealplan_source_freezer_chip({ count: onHand })}`
													: `❄️ ${m.mealplan_source_freezer_empty_chip()}`}
											{:else}
												🍳 {m.mealplan_source_fresh_chip({ count: onHand })}
											{/if}
										</button>
									{/if}
								</div>
								{#if dayPlanning && meal.status !== 'cooked'}
									<select
										class="select select-bordered select-xs w-20 shrink-0 {meal.plannedDate ? '' : 'text-base-content/40'}"
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
								<button
									type="button"
									class="btn btn-ghost btn-sm h-10 min-h-0 w-10 shrink-0 px-0 text-error"
									onclick={() => removeMeal(meal)}
									disabled={!!pendingDeletes[meal.id]}
									aria-label={m.mealplan_remove_meal_aria({ dinner: meal.dinner })}
								>
									<Icon name="trash" />
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<div class="p-3">
						<EmptyState mini title={m.mealplan_no_meals_title()}>
							{#snippet action()}
								<button type="button" class="btn btn-primary btn-xs" onclick={() => openAddDrawer(week.weekStartDate)}>
									{m.mealplan_add_meal()}
								</button>
							{/snippet}
						</EmptyState>
					</div>
				{/if}

				{#if suggestActive === week.weekStartDate}
					<div class="border-t border-base-200 bg-base-200/35 px-3 py-3" transition:slide={{ duration: 180 }}>
						<div class="mb-2 flex items-center justify-between gap-2">
							<p class="ui-section-label">{m.mealplan_ai_suggestions_label()}</p>
							<button type="button" class="btn btn-ghost btn-xs" onclick={closeSuggest}>
								{m.mealplan_close_suggest_button()}
							</button>
						</div>
						{#if suggestLoading}
							<div class="flex items-center gap-2 py-2 text-sm text-base-content/60">
								<span class="loading loading-dots loading-xs"></span>
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
		{/each}
	</div>
</div>

<BottomSheet bind:open={drawerOpen} title={m.mealplan_add_meal_sheet_title()}>
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
			<span class="min-w-0 flex-1 truncate text-sm">{m.mealplan_plan_custom_button({ query: drawerSearch.trim() })}</span>
			<span class="ui-chip-muted shrink-0">{m.mealplan_custom_chip()}</span>
		</button>
	{/if}

	{#if freezerRecipes.length > 0}
		<section class="mt-5">
			<div class="mb-2 flex items-baseline justify-between gap-3">
				<h3 class="ui-section-label">{m.mealplan_from_freezer_heading()}</h3>
				<span class="ui-chip-muted">{m.mealplan_stocked_chip({ count: freezerRecipes.length })}</span>
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
								onclick={() => addMealFromRecipe(recipe, 'freezer')}
								disabled={drawerSubmitting || !!pendingAdds[key]}
							>
								<span class="min-w-0">
									<span class="block truncate text-sm font-medium">{title}</span>
									<span class="text-xs text-base-content/45">
										{recipe.onHandPortions === 1
										? m.mealplan_portion_ready_singular({ count: recipe.onHandPortions })
										: m.mealplan_portions_ready_plural({ count: recipe.onHandPortions })}
									</span>
								</span>
								<span class="ui-chip-active shrink-0">❄️ {m.mealplan_plan_from_freezer_chip()}</span>
							</button>
						</li>
					{/each}
				</ul>
			{:else}
				<EmptyState mini title={m.mealplan_no_freezer_matches_title()} description={m.mealplan_no_freezer_matches_desc()} />
			{/if}
		</section>
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
								<span class="ui-chip-active shrink-0">{m.mealplan_in_freezer_chip({ count: recipe.onHandPortions })}</span>
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

<FreezePortionsModal
	bind:open={freezeOpen}
	slug={freezeSlug}
	title={freezeTitle}
	defaultPortions={freezeDefault}
	onFrozen={() => void invalidateAll()}
/>

<ConsumePortionsModal
	bind:open={consumeOpen}
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
