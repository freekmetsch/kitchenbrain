import { db as appDb } from '$lib/server/db/index';
import type { Db } from '$lib/server/db/types';
import { frozenPortionsByRecipe } from '$lib/server/domains/inventory/freezer';
import { listMealPlanMeals } from '$lib/server/domains/meal-plan/queries';
import { listRecipePlanningOptions } from '$lib/server/domains/recipes';
import { getMealPlanPrefs } from '$lib/server/meal_plan/prefs';
import {
	addDays,
	deliveryDateForPlanningWeek,
	isIsoDate,
	isoWeekNumber,
	nearestWeekBucket,
	todayIso,
	weekStartFor
} from '$lib/week';

export function loadMealPlanPage(url: URL, db: Db = appDb) {
	const prefs = getMealPlanPrefs(db);
	const currentWeekStart = weekStartFor(todayIso(), prefs.weekStartDay);
	const showPastWeeks = url.searchParams.get('past') === '1';
	const weekParam = url.searchParams.get('week');
	const focusWeek = isIsoDate(weekParam)
		? weekStartFor(weekParam!, prefs.weekStartDay)
		: null;
	const allMeals = listMealPlanMeals(db);
	const weekMap = new Map<string, typeof allMeals>();
	let hasPastWeeks = false;
	for (const meal of allMeals) {
		const bucket = nearestWeekBucket(meal.weekStartDate, prefs.weekStartDay);
		if (bucket < currentWeekStart) {
			hasPastWeeks = true;
			if (!showPastWeeks && bucket !== focusWeek) continue;
		}
		if (!weekMap.has(bucket)) weekMap.set(bucket, []);
		weekMap.get(bucket)!.push(meal);
	}
	for (let index = 0; index < prefs.planAheadWeeks; index++) {
		const weekStart = addDays(currentWeekStart, index * 7);
		if (!weekMap.has(weekStart)) weekMap.set(weekStart, []);
	}
	if (focusWeek && !weekMap.has(focusWeek)) weekMap.set(focusWeek, []);

	const weeks = [...weekMap.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([weekStartDate, meals]) => ({
			weekStartDate,
			weekNumber: isoWeekNumber(weekStartDate),
			deliveryDate:
				prefs.groceryDay == null
					? null
					: deliveryDateForPlanningWeek(
							weekStartDate,
							prefs.groceryDay,
							prefs.weekStartDay
						),
			meals
		}));

	const frozenPortions = frozenPortionsByRecipe(db);
	const recipeRows = listRecipePlanningOptions(db);
	const recipeList = recipeRows.map(({ lastCookedAt, ...recipe }) => ({
		...recipe,
		onHandPortions: frozenPortions.get(recipe.id) ?? 0
	}));
	const freezerPromptSummary = recipeList
		.filter((recipe) => recipe.onHandPortions > 0)
		.sort((left, right) => right.onHandPortions - left.onHandPortions)
		.slice(0, 8)
		.map(
			(recipe) =>
				`${recipe.onHandPortions} portion${recipe.onHandPortions === 1 ? '' : 's'} ${recipe.titleEn ?? recipe.title}`
		)
		.join('; ');
	const cycleCutoffMs = Date.now() - prefs.repeatCycleDays * 86_400_000;
	const recentlyCookedSummary =
		prefs.repeatCycleDays === 0
			? ''
			: recipeRows
					.filter(
						(recipe) =>
							recipe.lastCookedAt instanceof Date &&
							recipe.lastCookedAt.getTime() >= cycleCutoffMs
					)
					.sort(
						(left, right) =>
							right.lastCookedAt!.getTime() - left.lastCookedAt!.getTime()
					)
					.slice(0, 20)
					.map((recipe) => recipe.titleEn ?? recipe.title)
					.join('; ');

	return {
		weeks,
		currentWeekStart,
		focusWeek,
		recipeList,
		showPastWeeks,
		hasPastWeeks: hasPastWeeks && !showPastWeeks,
		freezerPromptSummary,
		recentlyCookedSummary,
		mealPlanPrefs: prefs
	};
}
