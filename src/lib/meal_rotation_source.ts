import { defaultServingsForMealSource, type MealSource } from '$lib/meal_source_choice';

type RotationSourceInput = {
	isFreezerStaple: boolean;
	targetPortions: number | null;
	onHandPortions: number;
	servings: number | null;
};

export type RotationSourceProjection = {
	action: 'cook' | 'use_freezer';
	mealSource: MealSource;
	servings: number | null;
	freezerLow: boolean;
	reason: 'below_target' | 'stock_available' | 'stock_empty';
};

export function projectRotationSource(input: RotationSourceInput): RotationSourceProjection {
	const onHandPortions = Math.max(0, input.onHandPortions);
	const belowTarget =
		input.isFreezerStaple &&
		input.targetPortions !== null &&
		onHandPortions < input.targetPortions;
	const mealSource: MealSource = onHandPortions > 0 && !belowTarget ? 'freezer' : 'fresh';

	return {
		action: mealSource === 'freezer' ? 'use_freezer' : 'cook',
		mealSource,
		servings: defaultServingsForMealSource(mealSource, input.servings, onHandPortions),
		freezerLow: belowTarget && input.servings !== null,
		reason: belowTarget ? 'below_target' : onHandPortions > 0 ? 'stock_available' : 'stock_empty'
	};
}
