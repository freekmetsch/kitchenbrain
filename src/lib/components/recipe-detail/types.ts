// Shared shapes for the recipe detail page (/recipes/[slug]) and its section
// components. Moved out of +page.svelte during the recipe-detail decomposition.
import type { CookModeRecipe } from '$lib/types';

export type IngredientSubstitute = {
	name: string;
	kind?: 'protein' | 'spice' | 'vegetable' | 'other';
	note?: string;
};
export type Ingredient = {
	name: string;
	amount: string;
	unit?: string;
	role?: 'cook_in' | 'serve_fresh';
	substitutes?: IngredientSubstitute[];
};
type TranslatedIngredient = {
	name: string;
	substitutes?: Array<{ name: string; note?: string }>;
};
type TranslationStatus = 'pending' | 'ready' | 'error';
export type Recipe = {
	id: number;
	slug: string;
	title: string;
	titleEn: string | null;
	category: string | null;
	categoryEn: string | null;
	tags: string[];
	servings: number | null;
	totalTimeMin: number | null;
	sourceUrl: string | null;
	imageUrl: string | null;
	ingredients: Ingredient[];
	ingredientsEn: TranslatedIngredient[] | null;
	directions: string[];
	directionsEn: string[] | null;
	notes: string | null;
	notesEn: string | null;
	rating: number | null;
	cuisine: string | null;
	cuisineEn: string | null;
	language: string | null;
	translationStatus: TranslationStatus;
	translatedAt: Date | null;
	cookModeJson: CookModeRecipe | null;
	isFreezerStaple: boolean;
	targetPortions: number | null;
	needsReview: boolean;
	reviewReason: string | null;
};
export type Week = { weekStartDate: string; weekNumber: number; label: string };

/**
 * Locale-aware labels for the plan-week pickers. The server load sends bare
 * `{ weekStartDate, weekNumber }` rows; this attaches "This week" / "Next
 * week" / "Week of …" client-side so the strings translate with the UI.
 */
export function labelWeeks(
	weeks: { weekStartDate: string; weekNumber: number }[],
	labels: { thisWeek: string; nextWeek: string; weekOf: (date: string) => string }
): Week[] {
	return weeks.map((week, i) => ({
		...week,
		label: i === 0 ? labels.thisWeek : i === 1 ? labels.nextWeek : labels.weekOf(week.weekStartDate)
	}));
}
