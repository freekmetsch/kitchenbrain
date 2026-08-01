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

export type CookSessionV5 = {
	v: 5;
	sig: string;
	frozenViewLang: 'en' | 'nl';
	currentStepKey: string | null;
	servings: number;
	frozenRecipe: FrozenCookRecipe;
	counterChecks: Record<string, boolean>;
	sessionSwaps: Record<string, SessionIngredientSwap>;
};

export type CookSessionReadResult =
	| { state: 'empty' }
	| { state: 'discard' }
	| { state: 'ready'; session: CookSessionV5 };

export function restoredCookSessionServings(
	storedServings: number,
	plannedServings: number | null
): number {
	return plannedServings != null && Number.isInteger(plannedServings) && plannedServings >= 1
		? plannedServings
		: storedServings;
}

export function readCookSession(value: unknown): CookSessionReadResult {
	if (value == null) return { state: 'empty' };
	if (typeof value !== 'object') return { state: 'discard' };
	const saved = value as Partial<Omit<CookSessionV5, 'v'>> & {
		v?: 4 | 5;
	};
	const frozen = saved.frozenRecipe;
	if (
		(saved.v !== 4 && saved.v !== 5) ||
		(saved.frozenViewLang !== 'en' && saved.frozenViewLang !== 'nl') ||
		typeof saved.sig !== 'string' ||
		!frozen ||
		typeof frozen.signature !== 'string' ||
		!Array.isArray(frozen.directions) ||
		!Array.isArray(frozen.directionIds) ||
		!Array.isArray(frozen.ingredients) ||
		!Array.isArray(frozen.canonicalIngredients)
	) return { state: 'discard' };
	return {
		state: 'ready',
		session: {
			v: 5,
			sig: saved.sig,
			frozenViewLang: saved.frozenViewLang,
			currentStepKey: typeof saved.currentStepKey === 'string' ? saved.currentStepKey : null,
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
