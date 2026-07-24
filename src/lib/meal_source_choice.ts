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
