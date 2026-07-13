// Recipe list sort keys — single source of truth shared by the zod validator
// (api/settings/recipe-prefs), the default-sort clamp (settings/recipes
// load), and both UI label surfaces (Recipes settings panel + settings index
// summary). Client- and server-safe (no server-only imports).
import { m } from '$lib/paraglide/messages';

export const SORT_VALUES = ['title', 'rating', 'recent', 'neglected', 'most-cooked'] as const;

export type SortBy = (typeof SORT_VALUES)[number];

// Resolved per call (not baked into a module-level constant) so the label
// reflects the current request/render's locale, not whichever locale was
// active when this module first loaded.
export function sortLabel(value: SortBy): string {
	switch (value) {
		case 'title':
			return m.recipes_sort_az();
		case 'rating':
			return m.recipes_sort_rating();
		case 'recent':
			return m.recipes_sort_recent();
		case 'neglected':
			return m.recipes_sort_neglected();
		case 'most-cooked':
			return m.recipes_sort_most_cooked();
	}
}

export function sortOptions(): { value: SortBy; label: string }[] {
	return SORT_VALUES.map((value) => ({ value, label: sortLabel(value) }));
}
