import type { PageServerLoad } from './$types';
import { asc, gte, lt } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { mealPlanMeals, recipes } from '$lib/server/db/schema';
import { frozenPortionsByRecipe } from '$lib/server/recipe_links';
import { offsetIsoWeek, isoWeekNumber, isoWeekStart } from '$lib/week';

const VISIBLE_WEEKS = 4;

export const load: PageServerLoad = async ({ url }) => {
	const currentWeekStart = isoWeekStart();
	const showPastWeeks = url.searchParams.get('past') === '1';

	const allMeals = db
		.select()
		.from(mealPlanMeals)
		.where(showPastWeeks ? undefined : gte(mealPlanMeals.weekStartDate, currentWeekStart))
		.orderBy(asc(mealPlanMeals.weekStartDate), asc(mealPlanMeals.sortOrder))
		.all();

	const hasPastWeeks =
		!showPastWeeks &&
		!!db
			.select({ id: mealPlanMeals.id })
			.from(mealPlanMeals)
			.where(lt(mealPlanMeals.weekStartDate, currentWeekStart))
			.limit(1)
			.get();

	const weekMap = new Map<string, typeof allMeals>();
	for (const meal of allMeals) {
		if (!weekMap.has(meal.weekStartDate)) weekMap.set(meal.weekStartDate, []);
		weekMap.get(meal.weekStartDate)!.push(meal);
	}

	for (let i = 0; i < VISIBLE_WEEKS; i++) {
		const weekStart = offsetIsoWeek(currentWeekStart, i);
		if (!weekMap.has(weekStart)) weekMap.set(weekStart, []);
	}

	const weeks = [...weekMap.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([weekStartDate, meals]) => ({
			weekStartDate,
			weekNumber: isoWeekNumber(weekStartDate),
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
			isFreezerStaple: recipes.isFreezerStaple
		})
		.from(recipes)
		.orderBy(asc(recipes.title))
		.all();
	const recipeList = recipeRows.map((recipe) => ({
		...recipe,
		onHandPortions: frozenPortions.get(recipe.id) ?? 0
	}));

	const freezerPromptSummary = recipeList
		.filter((recipe) => recipe.onHandPortions > 0)
		.sort((a, b) => b.onHandPortions - a.onHandPortions)
		.slice(0, 8)
		.map((recipe) => `${recipe.onHandPortions} portion${recipe.onHandPortions === 1 ? '' : 's'} ${recipe.titleEn ?? recipe.title}`)
		.join('; ');

	return { weeks, currentWeekStart, recipeList, showPastWeeks, hasPastWeeks, freezerPromptSummary };
};
