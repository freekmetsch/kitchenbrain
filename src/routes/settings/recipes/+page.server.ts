import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { db } from '$lib/server/db/index';
import { getUserPref } from '$lib/server/db/user_prefs';
import { getAutoTranslateOnImport, getCookModePreGeneration } from '$lib/server/recipes/prefs';
import { SORT_VALUES, type SortBy } from '$lib/recipe_sort';
import type { PageServerLoad } from './$types';

function defaultSort(value: string | null): SortBy {
	return (SORT_VALUES as readonly string[]).includes(value ?? '') ? (value as SortBy) : 'title';
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, base + '/login');

	return {
		recipeLanguage: getUserPref(db, locals.user.id, 'recipe_view_language') === 'nl' ? 'nl' : 'en',
		defaultSort: defaultSort(getUserPref(db, locals.user.id, 'recipe_default_sort')),
		autoTranslateOnImport: getAutoTranslateOnImport(),
		cookModePreGeneration: getCookModePreGeneration()
	};
};
