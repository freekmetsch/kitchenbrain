import { optimistic } from '$lib/optimistic';
import { toast } from '$lib/stores/toast.svelte';
import { m } from '$lib/paraglide/messages';
import { addDays, deliveryDateForPlanningWeek, todayIso } from '$lib/week';
import { weekdayName } from '$lib/weekday';
import {
	adjacentMealPlanWeeks,
	selectedMealPlanWeek
} from '$lib/meal_plan_navigation';
import {
	defaultServingsForMealSource,
	type MealSource
} from '$lib/meal_source_choice';

export type MealPlanMeal = {
	id: number;
	weekNumber: number;
	weekStartDate: string;
	dinner: string;
	recipeSlug: string | null;
	servings: number | null;
	status: 'planned' | 'cooked';
	source: MealSource;
	cookedDate: string | null;
	plannedDate: string | null;
	note: string | null;
	sortOrder: number;
	createdAt: Date;
};

export type MealPlanWeek = {
	weekStartDate: string;
	weekNumber: number;
	deliveryDate: string | null;
	meals: MealPlanMeal[];
};

export type MealPlanRecipe = {
	id: number;
	slug: string;
	title: string;
	titleEn: string | null;
	category: string | null;
	categoryEn: string | null;
	rating: number | null;
	servings: number | null;
	scalingMode: 'scalable' | 'fixed_batch';
	targetPortions: number | null;
	isFreezerStaple: boolean;
	onHandPortions: number;
};

export type MealPlanControllerData = {
	weeks: MealPlanWeek[];
	currentWeekStart: string;
	focusWeek: string | null;
	recipeList: MealPlanRecipe[];
	showPastWeeks: boolean;
	hasPastWeeks: boolean;
	freezerPromptSummary: string;
	recentlyCookedSummary: string;
	mealPlanPrefs: {
		weekStartDay: number;
		groceryDay: number | null;
		planAheadWeeks: number;
		dayPlanning: boolean;
		repeatCycleDays: number;
		suggestCount: number;
	};
};

type AddMealInput = {
	weekStartDate: string;
	dinner: string;
	recipeSlug?: string | null;
	source?: MealSource;
	servings?: number | null;
};

type ControllerDependencies = {
	basePath?: string;
	fetcher?: typeof fetch;
};

function cloneWeeks(value: MealPlanWeek[]): MealPlanWeek[] {
	return value.map((week) => ({
		...week,
		meals: week.meals.map((meal) => ({ ...meal }))
	}));
}

export class MealPlanController {
	weeks = $state<MealPlanWeek[]>([]);
	currentWeekStart = $state('');
	focusWeek = $state<string | null>(null);
	recipeList = $state<MealPlanRecipe[]>([]);
	showPastWeeks = $state(false);
	hasPastWeeks = $state(false);
	freezerPromptSummary = $state('');
	recentlyCookedSummary = $state('');
	prefs = $state<MealPlanControllerData['mealPlanPrefs']>({
		weekStartDay: 2,
		groceryDay: null,
		planAheadWeeks: 4,
		dayPlanning: false,
		repeatCycleDays: 14,
		suggestCount: 5
	});

	drawerOpen = $state(false);
	drawerWeek = $state('');
	drawerSearch = $state('');
	drawerCategory = $state('');
	drawerSubmitting = $state(false);

	suggestActive = $state<string | null>(null);
	suggestText = $state('');
	suggestLoading = $state(false);
	suggestError = $state('');
	applyingSuggestion = $state<Record<string, boolean>>({});
	addedSuggestions = $state<Record<string, boolean>>({});

	pendingAdds = $state<Record<string, boolean>>({});
	pendingToggles = $state<Record<number, boolean>>({});
	pendingDeletes = $state<Record<number, boolean>>({});
	pendingSourceToggles = $state<Record<number, boolean>>({});
	pendingServings = $state<Record<number, boolean>>({});
	servingsStatus = $state('');

	freezeOpen = $state(false);
	freezeSlug = $state('');
	freezeTitle = $state('');
	freezeDefault = $state(2);
	consumeOpen = $state(false);
	consumeSlug = $state('');
	consumeTitle = $state('');
	consumeDefault = $state(2);
	consumeMax = $state(99);

	private tempMealId = -1;
	private readonly basePath: string;
	private readonly fetcher: typeof fetch;

	constructor(initial: MealPlanControllerData, dependencies: ControllerDependencies = {}) {
		this.basePath = dependencies.basePath ?? '';
		this.fetcher =
			dependencies.fetcher ??
			((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
		this.syncData(initial);
	}

	syncData(data: MealPlanControllerData): void {
		this.weeks = cloneWeeks(data.weeks);
		this.currentWeekStart = data.currentWeekStart;
		this.focusWeek = data.focusWeek;
		this.recipeList = [...data.recipeList];
		this.showPastWeeks = data.showPastWeeks;
		this.hasPastWeeks = data.hasPastWeeks;
		this.freezerPromptSummary = data.freezerPromptSummary;
		this.recentlyCookedSummary = data.recentlyCookedSummary;
		this.prefs = { ...data.mealPlanPrefs };
	}

	get selectedWeek() {
		return selectedMealPlanWeek(this.weeks, this.focusWeek, this.currentWeekStart);
	}

	get adjacentWeeks() {
		return adjacentMealPlanWeeks(this.weeks, this.selectedWeek?.weekStartDate ?? null);
	}

	get filteredRecipes(): MealPlanRecipe[] {
		return this.recipeList
			.filter((recipe) => this.recipeMatchesDrawer(recipe))
			.sort(
				(left, right) =>
					right.onHandPortions - left.onHandPortions ||
					this.recipeDisplayTitle(left).localeCompare(this.recipeDisplayTitle(right))
			)
			.slice(0, 40);
	}

	get suggestLines(): string[] {
		return this.suggestText
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => /^(\d+[\.)]|[-*])\s+.+/.test(line))
			.map((line) => line.replace(/^(\d+[\.)]|[-*])\s+/, '').trim())
			.filter(Boolean);
	}

	get dayPlanning(): boolean {
		return this.prefs.dayPlanning;
	}

	recipeDisplayTitle(recipe: MealPlanRecipe): string {
		return recipe.titleEn ?? recipe.title;
	}

	recipeDisplayCategory(recipe: MealPlanRecipe): string | null {
		return recipe.categoryEn ?? recipe.category;
	}

	recipeForMeal(meal: MealPlanMeal): MealPlanRecipe | undefined {
		return meal.recipeSlug
			? this.recipeList.find((recipe) => recipe.slug === meal.recipeSlug)
			: undefined;
	}

	frozenPortionsFor(meal: MealPlanMeal): number {
		return this.recipeForMeal(meal)?.onHandPortions ?? 0;
	}

	weekDayOptions(weekStartDate: string): { date: string; label: string }[] {
		return Array.from({ length: 7 }, (_, index) => {
			const date = addDays(weekStartDate, index);
			return {
				date,
				label: weekdayName((this.prefs.weekStartDay + index) % 7, 'short')
			};
		});
	}

	displayMeals(week: MealPlanWeek): MealPlanMeal[] {
		if (!this.dayPlanning) return week.meals;
		return [...week.meals].sort(
			(left, right) =>
				(left.plannedDate ?? '9999-99-99').localeCompare(
					right.plannedDate ?? '9999-99-99'
				) ||
				left.sortOrder - right.sortOrder ||
				left.id - right.id
		);
	}

	addKey(weekStartDate: string, dinner: string, recipeSlug: string | null = null): string {
		return `${weekStartDate}:${recipeSlug ?? dinner.trim().toLowerCase()}`;
	}

	private recipeMatchesDrawer(recipe: MealPlanRecipe): boolean {
		const query = this.drawerSearch.trim().toLowerCase();
		const matchesSearch =
			!query ||
			recipe.title.toLowerCase().includes(query) ||
			(recipe.titleEn?.toLowerCase().includes(query) ?? false);
		const category = this.drawerCategory.toLowerCase();
		const matchesCategory =
			!this.drawerCategory ||
			(recipe.category?.toLowerCase().includes(category) ?? false) ||
			(recipe.categoryEn?.toLowerCase().includes(category) ?? false);
		return matchesSearch && matchesCategory;
	}

	private weekFor(weekStartDate: string): MealPlanWeek | undefined {
		return this.weeks.find((week) => week.weekStartDate === weekStartDate);
	}

	private setPendingAdd(key: string, pending: boolean): void {
		const next = { ...this.pendingAdds };
		if (pending) next[key] = true;
		else delete next[key];
		this.pendingAdds = next;
	}

	private setApplyingSuggestion(key: string, pending: boolean): void {
		const next = { ...this.applyingSuggestion };
		if (pending) next[key] = true;
		else delete next[key];
		this.applyingSuggestion = next;
	}

	private updateMeal(updated: MealPlanMeal): void {
		for (const week of this.weeks) {
			const index = week.meals.findIndex((meal) => meal.id === updated.id);
			if (index !== -1) {
				week.meals[index] = { ...updated };
				this.weeks = [...this.weeks];
				return;
			}
		}
	}

	private replaceMeal(tempId: number, saved: MealPlanMeal): void {
		for (const week of this.weeks) {
			const index = week.meals.findIndex((meal) => meal.id === tempId);
			if (index !== -1) {
				week.meals[index] = { ...saved };
				this.weeks = [...this.weeks];
				return;
			}
		}
		this.addMealToState(saved);
	}

	private removeMealFromState(id: number): void {
		for (const week of this.weeks) {
			const index = week.meals.findIndex((meal) => meal.id === id);
			if (index !== -1) {
				week.meals.splice(index, 1);
				this.weeks = [...this.weeks];
				return;
			}
		}
	}

	private addMealToState(meal: MealPlanMeal): void {
		const week = this.weekFor(meal.weekStartDate);
		if (week) {
			week.meals.push(meal);
			week.meals.sort(
				(left, right) => left.sortOrder - right.sortOrder || left.id - right.id
			);
			this.weeks = [...this.weeks];
			return;
		}
		this.weeks = [
			...this.weeks,
			{
				weekStartDate: meal.weekStartDate,
				weekNumber: meal.weekNumber,
				deliveryDate:
					this.prefs.groceryDay == null
						? null
						: deliveryDateForPlanningWeek(
								meal.weekStartDate,
								this.prefs.groceryDay,
								this.prefs.weekStartDay
							),
				meals: [meal]
			}
		].sort((left, right) => left.weekStartDate.localeCompare(right.weekStartDate));
	}

	openAddDrawer = (weekStartDate: string): void => {
		this.drawerWeek = weekStartDate;
		this.drawerSearch = '';
		this.drawerCategory = '';
		this.drawerOpen = true;
	};

	addMealOptimistic = async (
		input: AddMealInput,
		closeDrawer = true
	): Promise<boolean> => {
		const dinner = input.dinner.trim();
		if (!dinner) return false;
		const week = this.weekFor(input.weekStartDate);
		if (!week) return false;
		const key = this.addKey(input.weekStartDate, dinner, input.recipeSlug ?? null);
		if (this.pendingAdds[key]) return false;

		this.setPendingAdd(key, true);
		this.drawerSubmitting = true;
		const tempId = this.tempMealId--;
		const optimisticMeal: MealPlanMeal = {
			id: tempId,
			weekStartDate: input.weekStartDate,
			weekNumber: week.weekNumber,
			dinner,
			recipeSlug: input.recipeSlug ?? null,
			servings: input.servings ?? null,
			status: 'planned',
			source: input.source ?? 'fresh',
			cookedDate: null,
			plannedDate: null,
			note: null,
			sortOrder: week.meals.length,
			createdAt: new Date()
		};
		this.addMealToState(optimisticMeal);

		let saved: MealPlanMeal | null = null;
		const ok = await optimistic(
			async () => {
				const response = await this.fetcher(`${this.basePath}/api/meal-plan`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						weekStartDate: input.weekStartDate,
						dinner,
						recipeSlug: input.recipeSlug ?? null,
						servings: input.servings ?? null,
						source: input.source ?? 'fresh'
					})
				});
				if (response.ok) saved = await response.json();
				return response;
			},
			() => this.removeMealFromState(tempId),
			m.mealplan_toast_could_not_add()
		);

		this.setPendingAdd(key, false);
		this.drawerSubmitting = false;
		if (!ok || !saved) return false;
		this.replaceMeal(tempId, saved);
		if (closeDrawer) this.drawerOpen = false;
		return true;
	};

	toggleCooked = async (meal: MealPlanMeal): Promise<void> => {
		if (this.pendingToggles[meal.id]) return;
		const newStatus = meal.status === 'cooked' ? 'planned' : 'cooked';
		const previous = { ...meal };
		this.pendingToggles = { ...this.pendingToggles, [meal.id]: true };
		this.updateMeal({
			...meal,
			status: newStatus,
			cookedDate:
				newStatus === 'cooked' ? (meal.cookedDate ?? todayIso()) : null
		});
		let saved: MealPlanMeal | null = null;
		const ok = await optimistic(
			async () => {
				const response = await this.fetcher(
					`${this.basePath}/api/meal-plan/${meal.id}`,
					{
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ status: newStatus })
					}
				);
				if (response.ok) saved = await response.json();
				return response;
			},
			() => this.updateMeal(previous),
			m.mealplan_toast_could_not_update()
		);
		const next = { ...this.pendingToggles };
		delete next[meal.id];
		this.pendingToggles = next;
		if (!ok || !saved) return;
		this.updateMeal(saved);
		if (newStatus !== 'cooked' || !meal.recipeSlug) return;
		const recipe = this.recipeForMeal(meal);
		if (meal.source === 'freezer') {
			const onHand = recipe?.onHandPortions ?? 0;
			if (onHand > 0) {
				this.consumeSlug = meal.recipeSlug;
				this.consumeTitle = meal.dinner;
				this.consumeMax = onHand;
				this.consumeDefault = Math.min(onHand, recipe?.servings ?? 2);
				this.consumeOpen = true;
			} else {
				toast.error(m.mealplan_toast_no_frozen_portions({ dinner: meal.dinner }));
			}
		} else {
			this.freezeSlug = meal.recipeSlug;
			this.freezeTitle = meal.dinner;
			this.freezeDefault = recipe?.targetPortions ?? recipe?.servings ?? 2;
			this.freezeOpen = true;
		}
	};

	setMealSource = async (
		meal: MealPlanMeal,
		newSource: MealSource
	): Promise<void> => {
		if (this.pendingSourceToggles[meal.id] || meal.id < 0) return;
		const recipe = this.recipeForMeal(meal);
		if (!recipe || (newSource === 'freezer' && recipe.onHandPortions <= 0)) return;
		const servings = defaultServingsForMealSource(
			newSource,
			recipe.servings,
			recipe.onHandPortions
		);
		const previous = { ...meal };
		this.pendingSourceToggles = {
			...this.pendingSourceToggles,
			[meal.id]: true
		};
		this.updateMeal({ ...meal, source: newSource, servings });
		let saved: MealPlanMeal | null = null;
		const ok = await optimistic(
			async () => {
				const response = await this.fetcher(
					`${this.basePath}/api/meal-plan/${meal.id}`,
					{
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ source: newSource, servings })
					}
				);
				if (response.ok) saved = await response.json();
				return response;
			},
			() => this.updateMeal(previous),
			m.mealplan_toast_could_not_update()
		);
		const next = { ...this.pendingSourceToggles };
		delete next[meal.id];
		this.pendingSourceToggles = next;
		if (ok && saved) this.updateMeal(saved);
	};

	setPlannedDate = async (
		meal: MealPlanMeal,
		plannedDate: string | null
	): Promise<void> => {
		if (this.pendingToggles[meal.id]) return;
		const previous = { ...meal };
		this.pendingToggles = { ...this.pendingToggles, [meal.id]: true };
		this.updateMeal({ ...meal, plannedDate });
		let saved: MealPlanMeal | null = null;
		const ok = await optimistic(
			async () => {
				const response = await this.fetcher(
					`${this.basePath}/api/meal-plan/${meal.id}`,
					{
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ plannedDate })
					}
				);
				if (response.ok) saved = await response.json();
				return response;
			},
			() => this.updateMeal(previous),
			m.mealplan_toast_could_not_update()
		);
		const next = { ...this.pendingToggles };
		delete next[meal.id];
		this.pendingToggles = next;
		if (ok && saved) this.updateMeal(saved);
	};

	private restoreMeal = async (meal: MealPlanMeal): Promise<void> => {
		const key = this.addKey(meal.weekStartDate, meal.dinner, meal.recipeSlug);
		if (this.pendingAdds[key]) return;
		const tempId = this.tempMealId--;
		const restoredMeal: MealPlanMeal = {
			...meal,
			id: tempId,
			status: 'planned',
			cookedDate: null
		};
		this.setPendingAdd(key, true);
		this.addMealToState(restoredMeal);
		let saved: MealPlanMeal | null = null;
		const ok = await optimistic(
			async () => {
				const response = await this.fetcher(`${this.basePath}/api/meal-plan`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						weekStartDate: meal.weekStartDate,
						dinner: meal.dinner,
						recipeSlug: meal.recipeSlug,
						servings: meal.servings,
						plannedDate: meal.plannedDate,
						source: meal.source,
						note: meal.note
					})
				});
				if (response.ok) saved = await response.json();
				return response;
			},
			() => this.removeMealFromState(tempId),
			m.mealplan_toast_could_not_restore()
		);
		this.setPendingAdd(key, false);
		if (!ok) return;
		if (!saved) {
			this.removeMealFromState(tempId);
			toast.error(m.mealplan_toast_could_not_restore());
			return;
		}
		this.replaceMeal(tempId, saved);
	};

	removeMeal = async (meal: MealPlanMeal): Promise<void> => {
		if (this.pendingDeletes[meal.id]) return;
		const before = cloneWeeks(this.weeks);
		this.pendingDeletes = { ...this.pendingDeletes, [meal.id]: true };
		this.removeMealFromState(meal.id);
		const ok = await optimistic(
			() =>
				this.fetcher(`${this.basePath}/api/meal-plan/${meal.id}`, {
					method: 'DELETE'
				}),
			() => {
				this.weeks = before;
			},
			m.mealplan_toast_could_not_remove()
		);
		const next = { ...this.pendingDeletes };
		delete next[meal.id];
		this.pendingDeletes = next;
		if (ok) {
			toast.undo(
				m.mealplan_toast_removed({ dinner: meal.dinner }),
				() => void this.restoreMeal(meal)
			);
		}
	};

	addMealFromRecipe = async (
		recipe: MealPlanRecipe,
		source: MealSource = 'fresh'
	): Promise<void> => {
		await this.addMealOptimistic({
			weekStartDate: this.drawerWeek,
			dinner: this.recipeDisplayTitle(recipe),
			recipeSlug: recipe.slug,
			servings: defaultServingsForMealSource(
				source,
				recipe.servings,
				recipe.onHandPortions
			),
			source
		});
	};

	setServings = async (meal: MealPlanMeal, nextValue: number): Promise<boolean> => {
		if (meal.id < 0 || this.pendingServings[meal.id]) return false;
		if (
			!Number.isInteger(nextValue) ||
			nextValue < 1 ||
			nextValue > 99 ||
			nextValue === meal.servings
		) {
			return false;
		}
		const previous = { ...meal };
		this.pendingServings = { ...this.pendingServings, [meal.id]: true };
		this.updateMeal({ ...meal, servings: nextValue });
		let saved: MealPlanMeal | null = null;
		const ok = await optimistic(
			async () => {
				const response = await this.fetcher(
					`${this.basePath}/api/meal-plan/${meal.id}`,
					{
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ servings: nextValue })
					}
				);
				if (response.ok) saved = await response.json();
				return response;
			},
			() => this.updateMeal(previous),
			m.mealplan_toast_could_not_update_servings()
		);
		const pending = { ...this.pendingServings };
		delete pending[meal.id];
		this.pendingServings = pending;
		if (ok && saved) {
			this.updateMeal(saved);
			this.servingsStatus = m.mealplan_servings_updated({
				dinner: meal.dinner,
				count: nextValue
			});
		}
		return ok;
	};

	changeServings = async (meal: MealPlanMeal, delta: number): Promise<void> => {
		await this.setServings(
			meal,
			Math.max(1, Math.min(99, (meal.servings ?? 1) + delta))
		);
	};

	addCustomFromSearch = async (): Promise<void> => {
		const dinner = this.drawerSearch.trim();
		if (!dinner) return;
		await this.addMealOptimistic({ weekStartDate: this.drawerWeek, dinner });
	};

	startSuggest = async (weekStartDate: string): Promise<void> => {
		this.suggestActive = weekStartDate;
		this.suggestText = '';
		this.suggestError = '';
		this.suggestLoading = true;
		const recipeLibrary = this.recipeList
			.slice(0, 60)
			.map((recipe) => this.recipeDisplayTitle(recipe))
			.join(', ');
		const freezerContext = this.freezerPromptSummary
			? `Freezer stock available: ${this.freezerPromptSummary}. Meals served from the freezer only need their fresh sides bought that week (bread, rice, fresh garnishes), so they are cheap low-effort picks.`
			: 'No linked freezer meals are currently available.';
		const rotationContext =
			this.prefs.repeatCycleDays > 0 && this.recentlyCookedSummary
				? ` Do NOT suggest these meals — they were cooked within the last ${this.prefs.repeatCycleDays} days: ${this.recentlyCookedSummary}.`
				: '';
		try {
			const response = await this.fetcher(`${this.basePath}/api/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message: `Suggest ${this.prefs.suggestCount} meals for the week of ${weekStartDate}. Use this household context when useful: ${freezerContext} Recipe library: ${recipeLibrary}. Prefer meals that use available freezer portions or known recipes.${rotationContext} Reply in English with only a numbered list of meal names, no explanation.`
				})
			});
			if (!response.ok || !response.body) throw new Error('no stream');
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let doneReading = false;
			while (!doneReading) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';
				for (const line of lines) {
					if (!line.startsWith('data: ')) continue;
					const payload = line.slice(6);
					if (payload === '[DONE]') {
						doneReading = true;
						break;
					}
					try {
						const event = JSON.parse(payload);
						if (event.type === 'text') this.suggestText += event.text;
					} catch {
						// Ignore malformed stream chunks; a later chunk may still be valid.
					}
				}
			}
		} catch {
			this.suggestError = m.mealplan_toast_suggestions_failed();
			toast.error(m.mealplan_toast_suggestions_failed());
		} finally {
			this.suggestLoading = false;
		}
	};

	closeSuggest = (): void => {
		this.suggestActive = null;
		this.suggestText = '';
		this.suggestError = '';
	};

	applySuggestion = async (dinner: string): Promise<void> => {
		if (!this.suggestActive) return;
		const key = this.addKey(this.suggestActive, dinner);
		if (this.applyingSuggestion[key] || this.addedSuggestions[key]) return;
		this.setApplyingSuggestion(key, true);
		const ok = await this.addMealOptimistic(
			{ weekStartDate: this.suggestActive, dinner },
			false
		);
		if (ok) this.addedSuggestions = { ...this.addedSuggestions, [key]: true };
		this.setApplyingSuggestion(key, false);
	};
}
