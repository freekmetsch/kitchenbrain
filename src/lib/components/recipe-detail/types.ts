// Shared shapes for the recipe detail page (/recipes/[slug]) and its section
// components. Moved out of +page.svelte during the recipe-detail decomposition.
import type { CookModeRecipe } from '$lib/types';

export type Ingredient = { name: string; amount: string; unit?: string; role?: 'cook_in' | 'serve_fresh' };
type TranslatedIngredient = { name: string };
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
