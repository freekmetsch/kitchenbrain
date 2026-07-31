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

export function batchServingMultiplier(
	recipeServings: number | null,
	currentServings: number | null
): 1 | 2 | 3 | 4 | null {
	for (const multiplier of [1, 2, 3, 4] as const) {
		if (batchServingTarget(recipeServings, multiplier) === currentServings) return multiplier;
	}
	return null;
}
