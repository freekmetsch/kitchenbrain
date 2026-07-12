// Recipe list sort keys — single source of truth shared by the zod validator
// (api/settings/recipe-prefs), the default-sort clamp (settings/recipes
// load), and both UI label surfaces (Recipes settings panel + settings index
// summary). Client- and server-safe (no server-only imports).
export const SORT_OPTIONS = [
	{ value: 'title', label: 'A-Z' },
	{ value: 'rating', label: 'Rating' },
	{ value: 'recent', label: 'Recently cooked' },
	{ value: 'neglected', label: 'Neglected' },
	{ value: 'most-cooked', label: 'Most cooked' }
] as const;

export type SortBy = (typeof SORT_OPTIONS)[number]['value'];

export const SORT_VALUES = SORT_OPTIONS.map((o) => o.value) as [SortBy, ...SortBy[]];

export const SORT_LABELS: Record<SortBy, string> = Object.fromEntries(
	SORT_OPTIONS.map((o) => [o.value, o.label])
) as Record<SortBy, string>;
