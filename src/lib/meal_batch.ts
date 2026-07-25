export function batchServingTarget(
	recipeServings: number | null,
	multiplier: number
): number | null {
	if (
		recipeServings == null ||
		!Number.isInteger(recipeServings) ||
		recipeServings < 1 ||
		!Number.isInteger(multiplier) ||
		multiplier < 1
	) {
		return null;
	}

	const target = recipeServings * multiplier;
	return target <= 99 ? target : null;
}

export function batchServingToggleTarget(
	recipeServings: number | null,
	multiplier: number,
	currentServings: number | null
): number | null {
	const target = batchServingTarget(recipeServings, multiplier);
	if (target == null) return null;
	return currentServings === target
		? batchServingTarget(recipeServings, 1)
		: target;
}
