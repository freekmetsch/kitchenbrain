import { extractTimers } from '$lib/timer_extract';
import type { CookModeDisplayRecipe, CookModeStep } from '$lib/types';

function punctuateInstruction(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return '';
	return /[.!?]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}

function directionStep(direction: string): CookModeStep {
	const timer = extractTimers(direction)[0] ?? null;
	return {
		title: direction,
		goal: direction,
		body: direction,
		ingredients: [],
		timer_seconds: timer?.seconds ?? null,
		timer_purpose: timer ? direction : null,
		timer_action: null,
		timer_location: null,
		stream_id: 'recipe',
		merges_from: []
	};
}

export function cookingStepsFromDirections(
	directions: string[],
	options: {
		language: 'en' | 'nl';
		recipeTitle: string;
		servings: number | null;
	}
): CookModeDisplayRecipe {
	return {
		version: 4,
		language: options.language,
		generation_id: null,
		servings: options.servings,
		mise_en_place: [],
		streams: [{ id: 'recipe', name: options.recipeTitle }],
		steps: directions.map(directionStep)
	};
}

export function preparationAsFirstStep(
	plan: CookModeDisplayRecipe | null
): CookModeDisplayRecipe | null {
	if (!plan || !plan.mise_en_place.length) return plan;
	const preparation = plan.mise_en_place.map(punctuateInstruction).filter(Boolean).join(' ');
	if (!preparation) return { ...plan, mise_en_place: [] };

	return {
		...plan,
		mise_en_place: [],
		steps: [
			{
				title: preparation,
				goal: preparation,
				body: preparation,
				ingredients: [],
				timer_seconds: null,
				timer_purpose: null,
				timer_action: null,
				timer_location: null,
				stream_id: 'preparation',
				merges_from: []
			},
			...plan.steps
		]
	};
}
