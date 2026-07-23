import { extractTimers } from '$lib/timer_extract';
import type { CookModeDisplayRecipe, CookModeStep } from '$lib/types';
import type { Ingredient } from '$lib/recipe_ingredient';

function punctuateInstruction(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return '';
	return /[.!?]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}

function normalizedMatch(value: string): string {
	return value
		.normalize('NFKD')
		.toLocaleLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

function directionStep(
	direction: string,
	options: { directionId?: string; ingredients?: Ingredient[] }
): CookModeStep {
	const timer = extractTimers(direction)[0] ?? null;
	const haystack = ` ${normalizedMatch(direction)} `;
	const linked = (options.ingredients ?? []).filter((ingredient) => {
		const name = normalizedMatch(ingredient.name);
		return name.length >= 2 && haystack.includes(` ${name} `);
	});
	return {
		step_id: options.directionId,
		direction_id: options.directionId,
		title: direction,
		goal: direction,
		body: direction,
		ingredients: linked.map((ingredient) =>
			[ingredient.amount, ingredient.unit, ingredient.name].filter(Boolean).join(' ')
		),
		ingredient_ids: linked.flatMap((ingredient) => (ingredient.id ? [ingredient.id] : [])),
		ingredient_names: linked.map((ingredient) => ingredient.name),
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
		directionIds?: string[];
		ingredients?: Ingredient[];
	}
): CookModeDisplayRecipe {
	return {
		version: 4,
		language: options.language,
		generation_id: null,
		servings: options.servings,
		mise_en_place: [],
		streams: [{ id: 'recipe', name: options.recipeTitle }],
		steps: directions.map((direction, index) =>
			directionStep(direction, {
				directionId: options.directionIds?.[index],
				ingredients: options.ingredients
			})
		)
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
