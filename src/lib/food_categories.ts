export const CORE_FOOD_TYPE_OPTIONS = [
	{ value: 'meat', label: 'Meat' },
	{ value: 'fish', label: 'Fish' },
	{ value: 'vegetarian', label: 'Veggie' },
	{ value: 'vegan', label: 'Vegan' }
] as const;

const RECIPE_TYPE_OPTIONS = [
	...CORE_FOOD_TYPE_OPTIONS,
	{ value: 'soup', label: 'Soup' },
	{ value: 'salad', label: 'Salad' },
	{ value: 'pasta', label: 'Pasta' },
	{ value: 'pizza', label: 'Pizza' },
	{ value: 'dessert', label: 'Dessert' },
	{ value: 'breakfast', label: 'Breakfast' },
	{ value: 'side', label: 'Side' },
	{ value: 'sauce', label: 'Sauce' },
	{ value: 'snack', label: 'Snack' },
	{ value: 'other', label: 'Other' }
] as const;

const CATEGORY_ALIASES = new Map<string, string>([
	['veg', 'vegetarian'],
	['veggie', 'vegetarian'],
	['vegetables', 'vegetarian'],
	['vegetable', 'vegetarian'],
	['vega', 'vegetarian'],
	['vegetarisch', 'vegetarian'],
	['vegetarian', 'vegetarian'],
	['veganistisch', 'vegan'],
	['plant based', 'vegan'],
	['plant-based', 'vegan'],
	['seafood', 'fish'],
	['vis', 'fish'],
	['vlees', 'meat']
]);

const LABELS: ReadonlyMap<string, string> = new Map(
	RECIPE_TYPE_OPTIONS.map((option) => [option.value, option.label])
);

function cleanCategory(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[_-]+/g, ' ')
		.replace(/\s+/g, ' ');
}

export function normalizeFoodCategory(value: string | null | undefined): string | null {
	const cleaned = value ? cleanCategory(value) : '';
	if (!cleaned) return null;
	return CATEGORY_ALIASES.get(cleaned) ?? cleaned;
}

export function foodCategoryLabel(value: string | null | undefined): string | null {
	const normalized = normalizeFoodCategory(value);
	if (!normalized) return null;
	const label = LABELS.get(normalized);
	if (label) return label;
	return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function foodCategoryMatches(
	value: string | null | undefined,
	filter: string | null | undefined
): boolean {
	const normalizedValue = normalizeFoodCategory(value);
	const normalizedFilter = normalizeFoodCategory(filter);
	return !!normalizedValue && !!normalizedFilter && normalizedValue === normalizedFilter;
}
