export type MealSource = 'fresh' | 'freezer';

export function defaultServingsForMealSource(
	source: MealSource,
	baselineServings: number,
	frozenPortions: number
): number;
export function defaultServingsForMealSource(
	source: MealSource,
	baselineServings: number | null,
	frozenPortions: number
): number | null;
export function defaultServingsForMealSource(
	source: MealSource,
	baselineServings: number | null,
	frozenPortions: number
): number | null {
	return source === 'freezer' ? frozenPortions : baselineServings;
}

export function isMealSourceAvailable(source: MealSource, frozenPortions: number): boolean {
	return source === 'fresh' || frozenPortions > 0;
}

export function frozenPortionShortfall(servings: number, frozenPortions: number): number {
	return Math.max(0, servings - frozenPortions);
}

export function allocateFrozenPortions(
	meals: readonly {
		recipeSlug: string;
		servings: number;
		frozenPortions: number;
		source: MealSource;
	}[]
): number[] {
	const remainingByRecipe = new Map<string, number>();
	for (const meal of meals) {
		if (meal.source !== 'freezer') continue;
		remainingByRecipe.set(
			meal.recipeSlug,
			Math.max(remainingByRecipe.get(meal.recipeSlug) ?? 0, meal.frozenPortions)
		);
	}

	return meals.map((meal) => {
		if (meal.source !== 'freezer') return 0;
		const remaining = remainingByRecipe.get(meal.recipeSlug) ?? 0;
		const allocated = Math.min(meal.servings, remaining);
		remainingByRecipe.set(meal.recipeSlug, Math.max(0, remaining - allocated));
		return allocated;
	});
}
