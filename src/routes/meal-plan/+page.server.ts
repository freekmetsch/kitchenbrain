import type { PageServerLoad } from './$types';
import { asc, gte } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { mealPlanMeals, recipes } from '$lib/server/db/schema';
import { frozenPortionsByRecipe } from '$lib/server/recipe_links';
import { getMealPlanPrefs } from '$lib/server/meal_plan/prefs';
import { addDays, dateOfWeekday, isoWeekNumber, nearestWeekBucket, todayIso, weekStartFor } from '$lib/week';

export const load: PageServerLoad = async ({ url }) => {
	const prefs = getMealPlanPrefs();
	const currentWeekStart = weekStartFor(todayIso(), prefs.weekStartDay);
	const showPastWeeks = url.searchParams.get('past') === '1';

	// Meals are keyed by the week-start date they were created under; after the
	// household changes its week-start day, old keys no longer equal the new
	// bucket starts. Group by nearestWeekBucket (most-overlap week) so legacy
	// rows keep showing up in the week they effectively belong to.
	const allMeals = db
		.select()
		.from(mealPlanMeals)
		.orderBy(asc(mealPlanMeals.weekStartDate), asc(mealPlanMeals.sortOrder))
		.all();

	const weekMap = new Map<string, typeof allMeals>();
	let hasPastWeeks = false;
	for (const meal of allMeals) {
		const bucket = nearestWeekBucket(meal.weekStartDate, prefs.weekStartDay);
		if (bucket < currentWeekStart) {
			hasPastWeeks = true;
			if (!showPastWeeks) continue;
		}
		if (!weekMap.has(bucket)) weekMap.set(bucket, []);
		weekMap.get(bucket)!.push(meal);
	}

	for (let i = 0; i < prefs.planAheadWeeks; i++) {
		const weekStart = addDays(currentWeekStart, i * 7);
		if (!weekMap.has(weekStart)) weekMap.set(weekStart, []);
	}

	const weeks = [...weekMap.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([weekStartDate, meals]) => ({
			weekStartDate,
			weekNumber: isoWeekNumber(weekStartDate),
			deliveryDate:
				prefs.groceryDay == null ? null : dateOfWeekday(weekStartDate, prefs.groceryDay, prefs.weekStartDay),
			meals
		}));

	const frozenPortions = frozenPortionsByRecipe(db);
	const recipeRows = db
		.select({
			id: recipes.id,
			slug: recipes.slug,
			title: recipes.title,
			titleEn: recipes.titleEn,
			category: recipes.category,
			categoryEn: recipes.categoryEn,
			rating: recipes.rating,
			servings: recipes.servings,
			targetPortions: recipes.targetPortions,
			isFreezerStaple: recipes.isFreezerStaple,
			lastCookedAt: recipes.lastCookedAt
		})
		.from(recipes)
		.orderBy(asc(recipes.title))
		.all();
	const recipeList = recipeRows.map(({ lastCookedAt, ...recipe }) => ({
		...recipe,
		onHandPortions: frozenPortions.get(recipe.id) ?? 0
	}));

	const freezerPromptSummary = recipeList
		.filter((recipe) => recipe.onHandPortions > 0)
		.sort((a, b) => b.onHandPortions - a.onHandPortions)
		.slice(0, 8)
		.map((recipe) => `${recipe.onHandPortions} portion${recipe.onHandPortions === 1 ? '' : 's'} ${recipe.titleEn ?? recipe.title}`)
		.join('; ');

	// Rotation context for "Suggest": recipes cooked inside the repeat-cycle
	// window get listed as do-not-repeat candidates in the prompt.
	const cycleCutoffMs = Date.now() - prefs.repeatCycleDays * 86_400_000;
	const recentlyCookedSummary =
		prefs.repeatCycleDays === 0
			? ''
			: recipeRows
					.filter((r) => r.lastCookedAt instanceof Date && r.lastCookedAt.getTime() >= cycleCutoffMs)
					.sort((a, b) => b.lastCookedAt!.getTime() - a.lastCookedAt!.getTime())
					.slice(0, 20)
					.map((r) => r.titleEn ?? r.title)
					.join('; ');

	return {
		weeks,
		currentWeekStart,
		recipeList,
		showPastWeeks,
		hasPastWeeks: hasPastWeeks && !showPastWeeks,
		freezerPromptSummary,
		recentlyCookedSummary,
		mealPlanPrefs: prefs
	};
};
