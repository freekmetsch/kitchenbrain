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

export const BENCH_SHEET_RATINGS = ['good', 'bad'] as const;
export type BenchSheetRating = (typeof BENCH_SHEET_RATINGS)[number];
