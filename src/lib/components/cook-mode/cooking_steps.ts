import { extractTimers } from '$lib/timer_extract';
import type { CookModeDisplayRecipe, CookModeStep } from '$lib/types';
import type { Ingredient } from '$lib/recipe_ingredient';

function punctuateInstruction(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return '';
	return /[.!?]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}

function actionLeadPreparation(value: string, language: 'en' | 'nl'): string {
	const trimmed = value.trim();
	if (!/^(?:\d|[¼½¾⅓⅔⅛])/u.test(trimmed)) return trimmed;
	return `${language === 'nl' ? 'Bereid' : 'Prepare'} ${trimmed}`;
}

function normalizedMatch(value: string): string {
	return value
		.normalize('NFKD')
		.toLocaleLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

function preparationKeywords(value: string): string[] {
	const text = normalizedMatch(value);
	const groups: Array<[RegExp, string[]]> = [
		[/\b(chopped|chop|gehakt|fijngehakt|hak)\b/u, ['chop', 'hak']],
		[/\b(diced|dice|blokjes)\b/u, ['dice', 'snijd', 'blok']],
		[/\b(sliced|slice|gesneden|plakjes)\b/u, ['slice', 'snijd', 'plak']],
		[/\b(grated|grate|geraspt|rasp)\b/u, ['grate', 'rasp']],
		[/\b(minced|mince)\b/u, ['mince', 'hak']],
		[/\b(drained|drain|uitgelekt|afgegoten)\b/u, ['drain', 'giet']],
		[/\b(peeled|peel|geschild|schil)\b/u, ['peel', 'schil']],
		[/\b(crushed|crush|geplet|geperst)\b/u, ['crush', 'plet', 'pers']]
	];
	return groups.find(([pattern]) => pattern.test(text))?.[1] ?? [];
}

function preparationCovered(task: string, steps: CookModeStep[], ingredients: Ingredient[], indexes: number[]): boolean {
	const taskText = normalizedMatch(task);
	const ingredientNames = indexes
		.map((index) => ingredients[index]?.name)
		.filter(Boolean)
		.map(normalizedMatch);
	return steps.some((step) => {
		const body = normalizedMatch(step.body);
		if (ingredientNames.length && ingredientNames.some((name) => body.includes(name))) {
			const prepWords = preparationKeywords(taskText);
			return prepWords.length === 0 || prepWords.some((word) => body.includes(word));
		}
		return taskText.length > 0 && body.includes(taskText);
	});
}

function ingredientLabel(ingredient: Ingredient): string {
	return [ingredient.amount, ingredient.unit, ingredient.name, ingredient.preparation].filter(Boolean).join(' ');
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
	plan: CookModeDisplayRecipe | null,
	ingredients: Ingredient[] = []
): CookModeDisplayRecipe | null {
	if (!plan) return plan;
	const taskRecords = plan.prep_tasks?.map((task) => ({ text: task.text, indexes: task.ingredient_indexes })) ??
		plan.mise_en_place.map((text) => ({
			text,
			indexes: ingredients.flatMap((ingredient, index) =>
				normalizedMatch(text).includes(normalizedMatch(ingredient.name)) ? [index] : []
			)
		}));
	const derivedPreparation = taskRecords.length
		? taskRecords
		: ingredients.flatMap((ingredient, index) => ingredient.preparation ? [{
			text: `${plan.language === 'nl' ? 'Bereid' : 'Prepare'} ${ingredient.name} — ${ingredient.preparation}`,
			indexes: [index]
		}] : []);
	const tasks = derivedPreparation
		.map(({ text, indexes }) => ({ text: punctuateInstruction(actionLeadPreparation(text, plan.language)), indexes }))
		.filter(({ text, indexes }) => Boolean(text) && !preparationCovered(text, plan.steps, ingredients, indexes));
	if (!tasks.length) return { ...plan, mise_en_place: [], prep_tasks: [] };

	const prepSteps = tasks.map(({ text, indexes }) => ({
		title: text,
		goal: text,
		body: text,
		ingredients: indexes.map((index) => ingredients[index]).filter(Boolean).map(ingredientLabel),
		ingredient_indexes: indexes,
		ingredient_ids: indexes.map((index) => ingredients[index]?.id).filter((id): id is string => Boolean(id)),
		ingredient_names: indexes.map((index) => ingredients[index]?.name).filter((name): name is string => Boolean(name)),
		timer_seconds: null,
		timer_purpose: null,
		timer_action: null,
		timer_location: null,
		stream_id: 'preparation',
		merges_from: []
	}));

	return {
		...plan,
		mise_en_place: [],
		prep_tasks: [],
		streams: plan.streams.some((stream) => stream.id === 'preparation')
			? plan.streams
			: [...plan.streams, { id: 'preparation', name: plan.language === 'nl' ? 'Voorbereiding' : 'Preparation' }],
		steps: [
			...prepSteps,
			...plan.steps
		]
	};
}
