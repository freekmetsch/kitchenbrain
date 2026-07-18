import { getLocale } from '$lib/paraglide/runtime';
import { m } from '$lib/paraglide/messages';
import type { AppLocale } from '$lib/i18n';

export const CORE_FOOD_TYPE_OPTIONS = [
	{ value: 'meat' },
	{ value: 'fish' },
	{ value: 'vegetarian' },
	{ value: 'vegan' }
] as const;

const RECIPE_TYPE_OPTIONS = [
	...CORE_FOOD_TYPE_OPTIONS,
	{ value: 'soup' },
	{ value: 'salad' },
	{ value: 'pasta' },
	{ value: 'pizza' },
	{ value: 'dessert' },
	{ value: 'breakfast' },
	{ value: 'side' },
	{ value: 'sauce' },
	{ value: 'snack' },
	{ value: 'other' }
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

type Category = (typeof RECIPE_TYPE_OPTIONS)[number]['value'];

const CATEGORY_LABELS: Record<Category, (locale: AppLocale) => string> = {
	meat: (locale) => m.food_category_meat({}, { locale }),
	fish: (locale) => m.food_category_fish({}, { locale }),
	vegetarian: (locale) => m.food_category_vegetarian({}, { locale }),
	vegan: (locale) => m.food_category_vegan({}, { locale }),
	soup: (locale) => m.food_category_soup({}, { locale }),
	salad: (locale) => m.food_category_salad({}, { locale }),
	pasta: (locale) => m.food_category_pasta({}, { locale }),
	pizza: (locale) => m.food_category_pizza({}, { locale }),
	dessert: (locale) => m.food_category_dessert({}, { locale }),
	breakfast: (locale) => m.food_category_breakfast({}, { locale }),
	side: (locale) => m.food_category_side({}, { locale }),
	sauce: (locale) => m.food_category_sauce({}, { locale }),
	snack: (locale) => m.food_category_snack({}, { locale }),
	other: (locale) => m.food_category_other({}, { locale })
};

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

export function foodCategoryLabel(
	value: string | null | undefined,
	locale: AppLocale = getLocale()
): string | null {
	const normalized = normalizeFoodCategory(value);
	if (!normalized) return null;
	const label = CATEGORY_LABELS[normalized as Category];
	if (label) return label(locale);
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
