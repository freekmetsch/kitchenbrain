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

/** Persisted cache contract: v2 remains a renderable English legacy format. */
export type StoredCookModeRecipe = CookModeRecipe | LocalizedCookModeRecipe;

/** A language-specific projection used by the cooking UI. */
export type CookModeDisplayRecipe = {
	version: 2 | 3;
	language: 'en' | 'nl';
	generation_id: string | null;
	servings: number | null;
	mise_en_place: string[];
	streams: CookModeStream[];
	steps: CookModeStep[];
};

export const BENCH_SHEET_RATINGS = ['good', 'bad'] as const;
export type BenchSheetRating = (typeof BENCH_SHEET_RATINGS)[number];
