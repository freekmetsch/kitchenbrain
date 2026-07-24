export type CookModeStream = {
	id: string;
	name: string;
};

export type CookModeStep = {
	title: string;
	goal: string;
	body: string;
	ingredients: string[];
	timer_seconds: number | null;
	timer_purpose: string | null;
	timer_action: string | null;
	timer_location: string | null;
	stream_id: string;
	merges_from: string[];
	ingredient_indexes?: number[];
	ingredient_names?: string[];
	ingredient_ids?: string[];
	step_id?: string;
	direction_id?: string;
};

export type CookModeRecipe = {
	/** Cache contract. Missing/older versions are regenerated before display. */
	version: 2;
	/** Bench sheets are English display data; canonical Dutch stays in recipes.ingredients. */
	language: 'en';
	mise_en_place: string[];
	streams: CookModeStream[];
	steps: CookModeStep[];
};

export type LocalizedCookModeText = {
	en: string;
	nl: string;
};

export type LocalizedCookModeStream = {
	id: string;
	name: LocalizedCookModeText;
};

export type LocalizedCookModeStep = {
	title: LocalizedCookModeText;
	goal: LocalizedCookModeText;
	body: LocalizedCookModeText;
	ingredients: LocalizedCookModeText[];
	timer_seconds: number | null;
	timer_purpose: LocalizedCookModeText | null;
	timer_action: LocalizedCookModeText | null;
	timer_location: LocalizedCookModeText | null;
	stream_id: string;
	merges_from: string[];
	ingredient_indexes?: number[];
};

export type LocalizedCookModeRecipe = {
	version: 3;
	/** Server-stamped identity shared by EN and NL progress. */
	generation_id: string;
	/** The serving target used for every displayed quantity. */
	servings: number;
	mise_en_place: LocalizedCookModeText[];
	streams: LocalizedCookModeStream[];
	steps: LocalizedCookModeStep[];
};

export type LocalizedCookModePrepTask = {
	text: LocalizedCookModeText;
	ingredient_indexes: number[];
};

export type LocalizedCookModeStepV4 = Omit<LocalizedCookModeStep, 'ingredients'> & {
	ingredient_indexes: number[];
};

export type LocalizedCookModeRecipeV4 = {
	version: 4;
	generation_id: string;
	baseline_servings: number;
	prep_tasks: LocalizedCookModePrepTask[];
	streams: LocalizedCookModeStream[];
	steps: LocalizedCookModeStepV4[];
};

export type CookModeIngredientAllocation =
	| { kind: 'all' }
	| { kind: 'fraction'; numerator: number; denominator: number }
	| { kind: 'remaining' }
	| { kind: 'reference' };

export type LocalizedCookModeIngredientUseV5 = {
	ingredient_id: string;
	allocation: CookModeIngredientAllocation;
};

export type LocalizedCookModeStepV5 = {
	step_id: string;
	direction_id: string;
	stream_id: string;
	merges_from: string[];
	ingredient_uses: LocalizedCookModeIngredientUseV5[];
	timer_seconds: number | null;
	timer_purpose: LocalizedCookModeText | null;
	timer_action: LocalizedCookModeText | null;
	timer_location: LocalizedCookModeText | null;
};

export type LocalizedCookModeRecipeV5 = {
	version: 5;
	generation_id: string;
	baseline_servings: number;
	content_revision: number;
	structure_fingerprint: string;
	streams: LocalizedCookModeStream[];
	steps: LocalizedCookModeStepV5[];
};

/** Persisted cache contract: v2 remains a renderable English legacy format. */
export type StoredCookModeRecipe =
	| CookModeRecipe
	| LocalizedCookModeRecipe
	| LocalizedCookModeRecipeV4
	| LocalizedCookModeRecipeV5;

/** A language-specific projection used by the cooking UI. */
export type CookModeDisplayRecipe = {
	version: 2 | 3 | 4 | 5;
	language: 'en' | 'nl';
	generation_id: string | null;
	servings: number | null;
	mise_en_place: string[];
	prep_tasks?: Array<{ text: string; ingredient_indexes: number[] }>;
	streams: CookModeStream[];
	steps: CookModeStep[];
};

export const BENCH_SHEET_RATINGS = ['good', 'bad'] as const;
export type BenchSheetRating = (typeof BENCH_SHEET_RATINGS)[number];
