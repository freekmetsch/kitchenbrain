import type { Ingredient } from '$lib/recipe_ingredient';
import type { StoredCookModeRecipe } from '$lib/types';
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

export type CookSessionV3 = {
	v: 3;
	sig: string;
	frozenViewLang: 'en' | 'nl';
	currentStepKey: string | null;
	timerEnds: Record<number, number>;
	timerOrder: number[];
	servings: number;
	frozenRecipe: FrozenCookRecipe;
	counterChecks: Record<string, boolean>;
	sessionSwaps: Record<string, SessionIngredientSwap>;
};

export type CookSessionReadResult =
	| { state: 'empty' }
	| { state: 'discard' }
	| { state: 'ready'; session: CookSessionV3 };

export function readCookSession(value: unknown): CookSessionReadResult {
	if (value == null) return { state: 'empty' };
	if (typeof value !== 'object') return { state: 'discard' };
	const saved = value as Partial<CookSessionV3>;
	const frozen = saved.frozenRecipe;
	const timerEnds =
		saved.timerEnds && typeof saved.timerEnds === 'object'
			? Object.entries(saved.timerEnds)
			: null;
	const timerOrder = Array.isArray(saved.timerOrder) ? saved.timerOrder : null;
	if (
		saved.v !== 3 ||
		(saved.frozenViewLang !== 'en' && saved.frozenViewLang !== 'nl') ||
		typeof saved.sig !== 'string' ||
		!frozen ||
		typeof frozen.signature !== 'string' ||
		!Array.isArray(frozen.directions) ||
		!Array.isArray(frozen.directionIds) ||
		!Array.isArray(frozen.ingredients) ||
		!Array.isArray(frozen.canonicalIngredients) ||
		timerOrder == null ||
		timerOrder.some((index) => !Number.isInteger(index) || index < 0) ||
		new Set(timerOrder).size !== timerOrder.length ||
		timerEnds == null ||
		timerEnds.some(
			([index, end]) =>
				!/^\d+$/.test(index) ||
				typeof end !== 'number' ||
				!Number.isFinite(end) ||
				!timerOrder.includes(Number(index))
		) ||
		timerOrder.some((index) => !timerEnds.some(([savedIndex]) => Number(savedIndex) === index))
	) return { state: 'discard' };
	return {
		state: 'ready',
		session: {
			v: 3,
			sig: saved.sig,
			frozenViewLang: saved.frozenViewLang,
			currentStepKey: typeof saved.currentStepKey === 'string' ? saved.currentStepKey : null,
			timerEnds: saved.timerEnds as Record<number, number>,
			timerOrder,
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
		}
	};
}
