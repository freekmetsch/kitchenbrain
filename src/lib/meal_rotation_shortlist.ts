import {
	evaluateRotation,
	type RotationPolicy,
	type RotationReason,
	type RotationSeason
} from '$lib/meal_rotation';
import { projectRotationSource } from '$lib/meal_rotation_source';

export type RotationShortlistRecipe = {
	id: number;
	slug: string;
	title: string;
	titleEn: string | null;
	rating: number | null;
	servings: number | null;
	rotationPolicy: RotationPolicy | null;
	rotationSeasons: RotationSeason[];
	lastCookedAt: Date | null;
	isFreezerStaple: boolean;
	targetPortions: number | null;
	onHandPortions: number;
};

type PlannedMeal = {
	recipeSlug: string | null;
	weekStartDate: string;
	status: 'planned' | 'cooked';
};

export type RotationShortlistCandidate = {
	key: string;
	id: number;
	slug: string;
	title: string;
	titleEn: string | null;
	action: 'cook' | 'use_freezer';
	source: 'fresh' | 'freezer';
	servings: number | null;
	onHandPortions: number;
	targetPortions: number | null;
	reason: RotationReason;
};

type BuildRotationShortlistInput = {
	recipes: RotationShortlistRecipe[];
	plannedMeals: PlannedMeal[];
	targetWeekStart: string;
	currentWeekStart: string;
};

function candidateKey(
	recipe: RotationShortlistRecipe,
	weekStart: string,
	action: 'cook' | 'use_freezer'
): string {
	return [
		weekStart,
		recipe.slug,
		action,
		recipe.lastCookedAt?.getTime() ?? 'never',
		recipe.onHandPortions,
		recipe.targetPortions ?? 'none',
		recipe.rotationPolicy ?? 'unconfigured',
		recipe.rotationSeasons.join(',')
	].join(':');
}

function dueDate(candidate: RotationShortlistCandidate): string {
	return candidate.reason.dueDate ?? '0000-00-00';
}

export function buildRotationShortlist(input: BuildRotationShortlistInput): {
	due: RotationShortlistCandidate[];
	freezerLow: RotationShortlistCandidate[];
} {
	if (input.targetWeekStart < input.currentWeekStart) return { due: [], freezerLow: [] };
	const plannedWeeks = new Map<string, string[]>();
	for (const meal of input.plannedMeals) {
		if (meal.status !== 'planned' || !meal.recipeSlug) continue;
		plannedWeeks.set(meal.recipeSlug, [
			...(plannedWeeks.get(meal.recipeSlug) ?? []),
			meal.weekStartDate
		]);
	}

	const projected = input.recipes.map((recipe) => {
		const evaluation = evaluateRotation({
			policy: recipe.rotationPolicy,
			seasons: recipe.rotationSeasons,
			lastCookedAt: recipe.lastCookedAt,
			targetWeekStart: input.targetWeekStart,
			currentWeekStart: input.currentWeekStart,
			reservedWeekStarts: plannedWeeks.get(recipe.slug) ?? []
		});
		const source = projectRotationSource(recipe);
		const candidate: RotationShortlistCandidate = {
			key: candidateKey(recipe, input.targetWeekStart, source.action),
			id: recipe.id,
			slug: recipe.slug,
			title: recipe.title,
			titleEn: recipe.titleEn,
			action: source.action,
			source: source.mealSource,
			servings: source.servings,
			onHandPortions: recipe.onHandPortions,
			targetPortions: recipe.targetPortions,
			reason: evaluation.reason
		};
		return { recipe, evaluation, source, candidate };
	});

	const due = projected
		.filter(({ evaluation }) => evaluation.status === 'due')
		.sort(
			(left, right) =>
				dueDate(left.candidate).localeCompare(dueDate(right.candidate)) ||
				(right.recipe.rating ?? 0) - (left.recipe.rating ?? 0) ||
				(left.candidate.titleEn ?? left.candidate.title).localeCompare(
					right.candidate.titleEn ?? right.candidate.title
				)
		)
		.slice(0, 3)
		.map(({ candidate }) => candidate);
	const dueSlugs = new Set(due.map((candidate) => candidate.slug));
	const freezerLow = projected
		.filter(
			({ recipe, evaluation, source }) =>
				source.freezerLow &&
				!dueSlugs.has(recipe.slug) &&
				evaluation.status !== 'due' &&
				evaluation.status !== 'reserved' &&
				recipe.rotationPolicy !== 'never' &&
				recipe.rotationPolicy !== 'special'
		)
		.sort(
			(left, right) =>
				left.recipe.onHandPortions / (left.recipe.targetPortions ?? 1) -
					right.recipe.onHandPortions / (right.recipe.targetPortions ?? 1) ||
				(left.candidate.titleEn ?? left.candidate.title).localeCompare(
					right.candidate.titleEn ?? right.candidate.title
				)
		)
		.slice(0, 2)
		.map(({ candidate }) => candidate);

	return { due, freezerLow };
}
