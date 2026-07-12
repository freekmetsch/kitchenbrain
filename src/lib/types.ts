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
	mise_en_place: string[];
	streams: CookModeStream[];
	steps: CookModeStep[];
};

export const BENCH_SHEET_RATINGS = ['good', 'bad'] as const;
export type BenchSheetRating = (typeof BENCH_SHEET_RATINGS)[number];
