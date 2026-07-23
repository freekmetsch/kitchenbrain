// Cook-mode cached-payload staleness predicate.
//
// `cookModeJson` is cached on the recipe row. Valid v2 English sheets remain
// renderable; v3 adds one shared graph with bilingual text leaves and servings.
// This module owns validation and language projection for both formats.
//
// The regex + violatesActionState helpers also gate the AI's emit at
// validation time (see `cook_mode.ts`). Sharing the helpers here keeps the
// renderer's "is this old?" check and the server's "is this acceptable?"
// check in lockstep.

import type {
	CookModeDisplayRecipe,
	CookModeRecipe,
	CookModeIngredientAllocation,
	LocalizedCookModeText,
	StoredCookModeRecipe
} from '$lib/types';
import type { Ingredient } from '$lib/recipe_ingredient';
import {
	formatQuantity,
	occasionMultiplier,
	parseQuantity,
	scaleAmount
} from '$lib/recipe_scale';

// Action-led form: capitalized verb-led action, em-dash separator (` — `, U+2014),
// then a target state. Up to 8 words total, with ≥ 2 words before the em-dash
// (verb + object/subject). Hyphen-minus is rejected.
// Examples: "Sweat shallots — translucent", "Reduce sauce — coats spoon",
// "Roast chicken — 74°C in thigh", "Bake top — set with crackle".
export const ACTION_STATE_RE = /^[A-Z][^—.,;:!?]+\s+—\s+\S/;

export function violatesActionState(value: string): string | null {
	if (!ACTION_STATE_RE.test(value)) {
		return 'must be action-led form: "Verb-led action — target state" (capital start, em-dash U+2014 separator, no premature punctuation)';
	}
	const parts = value.split(/\s+—\s+/);
	const preWords = parts[0].trim().split(/\s+/).filter((w) => w.length > 0);
	if (preWords.length < 2) {
		return 'must have ≥ 2 words before the em-dash (verb + object/subject — old noun-state form rejected)';
	}
	const allWords = value.trim().split(/\s+/).filter((w) => w !== '—' && w.length > 0);
	if (allWords.length > 8) {
		return `must be ≤ 8 words (got ${allWords.length})`;
	}
	return null;
}

// True when a cached cookMode payload is stale relative to the current schema
// shape — i.e. needs a force-regen on next view. Returns FALSE for null
// (caller distinguishes empty vs stale: empty = first generation, stale = re-gen).
//
// Null means no cache rather than stale. Unknown versions and malformed v2/v3
// payloads are stale and regenerate on the next cooking-view request.
function validLocalizedText(value: unknown): value is LocalizedCookModeText {
	if (value == null || typeof value !== 'object') return false;
	const text = value as Partial<LocalizedCookModeText>;
	return typeof text.en === 'string' && text.en.trim() !== '' && typeof text.nl === 'string' && text.nl.trim() !== '';
}

function isValidV2(cm: Partial<CookModeRecipe>): boolean {
	if (cm.language !== 'en') return false;
	if (!Array.isArray(cm.streams) || cm.streams.length === 0) return false;
	if (!Array.isArray(cm.steps)) return false;
	for (const step of cm.steps) {
		if (typeof step.goal !== 'string' || violatesActionState(step.goal) != null) return false;
		if (step.timer_seconds != null && (step.timer_action == null || step.timer_action === '')) return false;
	}
	return true;
}

function isValidV3(cm: Partial<StoredCookModeRecipe>): boolean {
	if (!('generation_id' in cm) || typeof cm.generation_id !== 'string' || !cm.generation_id) return false;
	if (!('servings' in cm) || !Number.isInteger(cm.servings) || (cm.servings as number) < 1) return false;
	if (!Array.isArray(cm.streams) || cm.streams.length === 0 || !Array.isArray(cm.steps)) return false;
	if (!Array.isArray(cm.mise_en_place) || !cm.mise_en_place.every(validLocalizedText)) return false;
	for (const stream of cm.streams) {
		if (!validLocalizedText(stream.name)) return false;
	}
	for (const step of cm.steps) {
		if (!validLocalizedText(step.title) || !validLocalizedText(step.goal) || !validLocalizedText(step.body)) return false;
		if (violatesActionState(step.goal.en) != null || violatesActionState(step.goal.nl) != null) return false;
		if (!Array.isArray(step.ingredients) || !step.ingredients.every(validLocalizedText)) return false;
		if (step.timer_seconds != null) {
			if (!validLocalizedText(step.timer_purpose) || !validLocalizedText(step.timer_action) || !validLocalizedText(step.timer_location)) return false;
		} else if (step.timer_purpose != null || step.timer_action != null || step.timer_location != null) {
			return false;
		}
	}
	return true;
}

function isValidV4(cm: any): boolean {
	if (typeof cm.generation_id !== 'string' || !cm.generation_id) return false;
	if (!Number.isInteger(cm.baseline_servings) || cm.baseline_servings < 1) return false;
	if (!Array.isArray(cm.streams) || cm.streams.length === 0 || !Array.isArray(cm.steps)) return false;
	if (!Array.isArray(cm.prep_tasks)) return false;
	if (!cm.prep_tasks.every((task: any) =>
		validLocalizedText(task.text) &&
		Array.isArray(task.ingredient_indexes) &&
		task.ingredient_indexes.length <= 1 &&
		task.ingredient_indexes.every((index: unknown) => Number.isInteger(index) && (index as number) >= 0)
	)) return false;
	for (const stream of cm.streams) if (!validLocalizedText(stream.name)) return false;
	for (const step of cm.steps) {
		if (!validLocalizedText(step.title) || !validLocalizedText(step.goal) || !validLocalizedText(step.body)) return false;
		if (violatesActionState(step.goal.en) != null || violatesActionState(step.goal.nl) != null) return false;
		if (!Array.isArray(step.ingredient_indexes) || step.ingredient_indexes.some((index: unknown) => !Number.isInteger(index) || (index as number) < 0)) return false;
		if (step.timer_seconds != null) {
			if (!validLocalizedText(step.timer_purpose) || !validLocalizedText(step.timer_action) || !validLocalizedText(step.timer_location)) return false;
		} else if (step.timer_purpose != null || step.timer_action != null || step.timer_location != null) return false;
	}
	return true;
}

function allocationFraction(
	allocation: CookModeIngredientAllocation,
	consumed: number
): { valid: boolean; fraction: number; consumed: number; terminal: boolean } {
	if (allocation.kind === 'reference') {
		return { valid: true, fraction: 1, consumed, terminal: false };
	}
	if (allocation.kind === 'all') {
		return {
			valid: consumed === 0,
			fraction: 1,
			consumed: 1,
			terminal: true
		};
	}
	if (allocation.kind === 'fraction') {
		const valid =
			Number.isInteger(allocation.numerator) &&
			Number.isInteger(allocation.denominator) &&
			allocation.numerator > 0 &&
			allocation.denominator > 0 &&
			allocation.numerator <= allocation.denominator;
		const fraction = valid ? allocation.numerator / allocation.denominator : 0;
		return {
			valid: valid && consumed + fraction <= 1 + Number.EPSILON,
			fraction,
			consumed: consumed + fraction,
			terminal: false
		};
	}
	const fraction = 1 - consumed;
	return {
		valid: fraction > Number.EPSILON,
		fraction,
		consumed: 1,
		terminal: true
	};
}

export function isValidCookModeV5(cm: any): boolean {
	if (typeof cm.generation_id !== 'string' || !cm.generation_id) return false;
	if (!Number.isInteger(cm.baseline_servings) || cm.baseline_servings < 1) return false;
	if (!Number.isInteger(cm.content_revision) || cm.content_revision < 1) return false;
	if (typeof cm.structure_fingerprint !== 'string' || !cm.structure_fingerprint) return false;
	if (!Array.isArray(cm.streams) || cm.streams.length === 0 || !Array.isArray(cm.steps)) return false;
	const streamIds = new Set<string>();
	for (const stream of cm.streams) {
		if (typeof stream.id !== 'string' || !stream.id || streamIds.has(stream.id)) return false;
		if (!validLocalizedText(stream.name)) return false;
		streamIds.add(stream.id);
	}
	const stepIds = new Set<string>();
	const directionIds = new Set<string>();
	const consumed = new Map<string, number>();
	const terminal = new Set<string>();
	for (const step of cm.steps) {
		if (typeof step.step_id !== 'string' || !step.step_id || stepIds.has(step.step_id)) return false;
		if (
			typeof step.direction_id !== 'string' ||
			!step.direction_id ||
			directionIds.has(step.direction_id)
		) return false;
		if (!streamIds.has(step.stream_id)) return false;
		if (
			!Array.isArray(step.merges_from) ||
			step.merges_from.some(
				(id: unknown) => typeof id !== 'string' || !streamIds.has(id) || id === step.stream_id
			) ||
			new Set(step.merges_from).size !== step.merges_from.length
		) return false;
		if (!Array.isArray(step.ingredient_uses)) return false;
		for (const use of step.ingredient_uses) {
			if (typeof use.ingredient_id !== 'string' || !use.ingredient_id) return false;
			if (!use.allocation || typeof use.allocation.kind !== 'string') return false;
			if (terminal.has(use.ingredient_id) && use.allocation.kind !== 'reference') return false;
			const result = allocationFraction(
				use.allocation,
				consumed.get(use.ingredient_id) ?? 0
			);
			if (!result.valid) return false;
			consumed.set(use.ingredient_id, result.consumed);
			if (result.terminal) terminal.add(use.ingredient_id);
		}
		if (step.timer_seconds != null) {
			if (!Number.isInteger(step.timer_seconds) || step.timer_seconds < 1) return false;
			if (
				!validLocalizedText(step.timer_purpose) ||
				!validLocalizedText(step.timer_action) ||
				!validLocalizedText(step.timer_location)
			) return false;
		} else if (
			step.timer_purpose != null ||
			step.timer_action != null ||
			step.timer_location != null
		) return false;
		stepIds.add(step.step_id);
		directionIds.add(step.direction_id);
	}
	return true;
}

export function isStaleCookMode(cm: Partial<StoredCookModeRecipe> | null): boolean {
	if (cm == null) return false;
	if (cm.version === 2) return !isValidV2(cm as Partial<CookModeRecipe>);
	if (cm.version === 3) return !isValidV3(cm);
	if (cm.version === 4) return !isValidV4(cm);
	if (cm.version === 5) return !isValidCookModeV5(cm);
	return true;
}

export function hasCookModeLanguage(
	cm: Partial<StoredCookModeRecipe> | null,
	language: 'en' | 'nl',
	servings: number
): boolean {
	if (cm == null || isStaleCookMode(cm)) return false;
	if (cm.version === 2) return language === 'en';
	if (cm.version === 4 || cm.version === 5) return true;
	return 'servings' in cm && cm.servings === servings;
}

export function localizeCookMode(
	cm: StoredCookModeRecipe | null,
	language: 'en' | 'nl',
	quantity?: {
		ingredients: Ingredient[];
		baselineServings: number | null;
		targetServings: number;
		directions?: string[];
		directionIds?: string[];
	}
): CookModeDisplayRecipe | null {
	if (cm == null || isStaleCookMode(cm)) return null;
	if (cm.version === 2) {
		if (language !== 'en') return null;
		return { ...cm, generation_id: null, servings: null };
	}
	const pick = (value: LocalizedCookModeText) => value[language];
	if (cm.version === 5) {
		const multiplier = occasionMultiplier(
			quantity?.baselineServings ?? cm.baseline_servings,
			quantity?.targetServings ?? cm.baseline_servings
		);
		const ingredientById = new Map(
			(quantity?.ingredients ?? []).flatMap((ingredient) =>
				ingredient.id ? [[ingredient.id, ingredient] as const] : []
			)
		);
		const directionById = new Map(
			(quantity?.directionIds ?? []).map((id, index) => [id, quantity?.directions?.[index] ?? ''])
		);
		const consumed = new Map<string, number>();
		const ingredientLabel = (
			ingredientId: string,
			allocation: CookModeIngredientAllocation
		): string | null => {
			const ingredient = ingredientById.get(ingredientId);
			if (!ingredient) return null;
			const result = allocationFraction(allocation, consumed.get(ingredientId) ?? 0);
			if (!result.valid) return null;
			if (allocation.kind !== 'reference') consumed.set(ingredientId, result.consumed);
			const scaled = scaleAmount(
				ingredient.amount,
				ingredient.name,
				multiplier,
				ingredient.scale ?? 'linear',
				language
			);
			const parsed = parseQuantity(scaled);
			const amount =
				allocation.kind === 'reference' || !parsed
					? scaled
					: formatQuantity(
							{
								min: parsed.min * result.fraction,
								max: parsed.max == null ? undefined : parsed.max * result.fraction
							},
							language
						);
			return [amount, ingredient.unit, ingredient.name].filter(Boolean).join(' ');
		};
		return {
			version: 5,
			language,
			generation_id: cm.generation_id,
			servings: quantity?.targetServings ?? cm.baseline_servings,
			mise_en_place: [],
			streams: cm.streams.map((stream) => ({ id: stream.id, name: pick(stream.name) })),
			steps: cm.steps.map((step) => {
				const body = directionById.get(step.direction_id) || step.direction_id;
				return {
					step_id: step.step_id,
					direction_id: step.direction_id,
					title: body,
					goal: body,
					body,
					ingredients: step.ingredient_uses
						.map((use) => ingredientLabel(use.ingredient_id, use.allocation))
						.filter((label): label is string => label != null),
					ingredient_ids: step.ingredient_uses.map((use) => use.ingredient_id),
					ingredient_names: step.ingredient_uses
						.map((use) => ingredientById.get(use.ingredient_id)?.name)
						.filter((name): name is string => name != null),
					timer_seconds: step.timer_seconds,
					timer_purpose: step.timer_purpose == null ? null : pick(step.timer_purpose),
					timer_action: step.timer_action == null ? null : pick(step.timer_action),
					timer_location: step.timer_location == null ? null : pick(step.timer_location),
					stream_id: step.stream_id,
					merges_from: step.merges_from
				};
			})
		};
	}
	if (cm.version === 4) {
		const multiplier = occasionMultiplier(quantity?.baselineServings ?? cm.baseline_servings, quantity?.targetServings ?? cm.baseline_servings);
		const ingredientLabel = (index: number) => {
			const ingredient = quantity?.ingredients[index];
			if (!ingredient) return null;
			const amount = scaleAmount(ingredient.amount, ingredient.name, multiplier, ingredient.scale ?? 'linear', language);
			return [amount, ingredient.unit, ingredient.name, ingredient.preparation].filter(Boolean).join(' ');
		};
		const ingredientName = (index: number) => quantity?.ingredients[index]?.name ?? null;
		return {
			version: 4,
			language,
			generation_id: cm.generation_id,
			servings: quantity?.targetServings ?? cm.baseline_servings,
			mise_en_place: cm.prep_tasks.map((task) => pick(task.text)),
			prep_tasks: cm.prep_tasks.map((task) => ({
				text: pick(task.text),
				ingredient_index: task.ingredient_indexes[0] ?? null
			})),
			streams: cm.streams.map((stream) => ({ id: stream.id, name: pick(stream.name) })),
			steps: cm.steps.map((step) => ({
				title: pick(step.title),
				goal: pick(step.goal),
				body: pick(step.body),
				ingredients: step.ingredient_indexes.map(ingredientLabel).filter((label): label is string => label != null),
				ingredient_indexes: step.ingredient_indexes,
				ingredient_names: step.ingredient_indexes.map(ingredientName).filter((name): name is string => name != null),
				timer_seconds: step.timer_seconds,
				timer_purpose: step.timer_purpose == null ? null : pick(step.timer_purpose),
				timer_action: step.timer_action == null ? null : pick(step.timer_action),
				timer_location: step.timer_location == null ? null : pick(step.timer_location),
				stream_id: step.stream_id,
				merges_from: step.merges_from
			}))
		};
	}
	return {
		version: 3,
		language,
		generation_id: cm.generation_id,
		servings: cm.servings,
		mise_en_place: cm.mise_en_place.map(pick),
		streams: cm.streams.map((stream) => ({ id: stream.id, name: pick(stream.name) })),
		steps: cm.steps.map((step) => ({
			title: pick(step.title),
			goal: pick(step.goal),
			body: pick(step.body),
			ingredients: step.ingredients.map(pick),
			timer_seconds: step.timer_seconds,
			timer_purpose: step.timer_purpose == null ? null : pick(step.timer_purpose),
			timer_action: step.timer_action == null ? null : pick(step.timer_action),
			timer_location: step.timer_location == null ? null : pick(step.timer_location),
			stream_id: step.stream_id,
			merges_from: step.merges_from
		}))
	};
}
