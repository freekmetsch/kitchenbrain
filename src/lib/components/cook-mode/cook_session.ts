import type { Ingredient } from '$lib/recipe_ingredient';
import type { CookModeDisplayRecipe, StoredCookModeRecipe } from '$lib/types';
import type { SessionIngredientSwap } from './cook_counter';

export type FrozenCookRecipe = {
	signature: string;
	storedCookMode: StoredCookModeRecipe | null;
	directions: string[];
	directionIds: string[];
	ingredients: Ingredient[];
	canonicalIngredients: Ingredient[];
	baselineServings: number | null;
};

export type CookSessionV2 = {
	v: 2;
	sig: string;
	currentStepKey: string | null;
	timerEnds: Record<number, number>;
	timerOrder: number[];
	servings: number;
	frozenRecipe: FrozenCookRecipe;
	counterChecks: Record<string, boolean>;
	sessionSwaps: Record<string, SessionIngredientSwap>;
};

export function decodeCookSession(value: unknown): CookSessionV2 | null {
	if (value == null || typeof value !== 'object') return null;
	const saved = value as Partial<CookSessionV2>;
	const frozen = saved.frozenRecipe;
	if (
		saved.v !== 2 ||
		typeof saved.sig !== 'string' ||
		!frozen ||
		typeof frozen.signature !== 'string' ||
		!Array.isArray(frozen.directions) ||
		!Array.isArray(frozen.directionIds) ||
		!Array.isArray(frozen.ingredients) ||
		!Array.isArray(frozen.canonicalIngredients) ||
		!Array.isArray(saved.timerOrder) ||
		saved.timerEnds == null ||
		typeof saved.timerEnds !== 'object'
	) return null;
	return {
		v: 2,
		sig: saved.sig,
		currentStepKey: typeof saved.currentStepKey === 'string' ? saved.currentStepKey : null,
		timerEnds: saved.timerEnds,
		timerOrder: saved.timerOrder.filter((index) => Number.isInteger(index) && index >= 0),
		servings:
			Number.isInteger(saved.servings) && (saved.servings as number) >= 1
				? (saved.servings as number)
				: frozen.baselineServings ?? 4,
		frozenRecipe: frozen,
		counterChecks:
			saved.counterChecks && typeof saved.counterChecks === 'object'
				? saved.counterChecks
				: {},
		sessionSwaps:
			saved.sessionSwaps && typeof saved.sessionSwaps === 'object'
				? saved.sessionSwaps
				: {}
	};
}

export function migrateLegacyCookSession(
	value: unknown,
	currentPlan: CookModeDisplayRecipe,
	signature: string,
	frozenRecipe: FrozenCookRecipe
): CookSessionV2 | null {
	if (value == null || typeof value !== 'object') return null;
	const saved = value as Record<string, unknown>;
	if (saved.v === 2 || saved.sig !== signature) return null;
	const timerEnds =
		saved.timerEnds && typeof saved.timerEnds === 'object'
			? (saved.timerEnds as Record<number, number>)
			: {};
	const timerOrder = Array.isArray(saved.timerOrder)
		? saved.timerOrder.filter((index): index is number => Number.isInteger(index) && index >= 0)
		: [];
	const currentStepKey =
		typeof saved.currentStepKey === 'string' ? saved.currentStepKey : null;
	const firstStep = currentPlan.steps[0];
	const firstKeys = firstStep
		? new Set(
				[
					firstStep.step_id,
					firstStep.direction_id,
					`0:${firstStep.stream_id}`
				].filter((key): key is string => Boolean(key))
			)
		: new Set<string>();
	if (timerOrder.length === 0 && (!currentStepKey || firstKeys.has(currentStepKey))) return null;
	return {
		v: 2,
		sig: signature,
		currentStepKey,
		timerEnds,
		timerOrder,
		servings: currentPlan.servings ?? frozenRecipe.baselineServings ?? 4,
		frozenRecipe: structuredClone(frozenRecipe),
		counterChecks: {},
		sessionSwaps: {}
	};
}
