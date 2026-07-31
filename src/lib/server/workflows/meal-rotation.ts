import type { DbOrTx } from '$lib/server/db/types';
import { frozenPortionsByRecipe } from '$lib/server/domains/inventory/freezer';
import { listMealPlanMeals } from '$lib/server/domains/meal-plan/queries';
import { listRecipePlanningOptions } from '$lib/server/domains/recipes';
import { buildRotationShortlist } from '$lib/meal_rotation_shortlist';

export function rotationShortlistForWeek(
	db: DbOrTx,
	targetWeekStart: string,
	currentWeekStart: string
) {
	const onHand = frozenPortionsByRecipe(db);
	const recipes = listRecipePlanningOptions(db).map(({ rotationSeasonsJson, ...recipe }) => ({
		...recipe,
		rotationSeasons: rotationSeasonsJson,
		onHandPortions: onHand.get(recipe.id) ?? 0
	}));
	return buildRotationShortlist({
		recipes,
		plannedMeals: listMealPlanMeals(db),
		targetWeekStart,
		currentWeekStart
	});
}
