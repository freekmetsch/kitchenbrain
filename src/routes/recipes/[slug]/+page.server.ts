import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { loadRecipeDetailData } from '$lib/server/workflows/recipe-pages';

export const load: PageServerLoad = async ({ params, parent, url }) => {
	const { recipeLang } = await parent();
	const data = loadRecipeDetailData(params.slug, { recipeLang, url });
	if (!data) throw error(404, 'Recipe not found');
	return data;
};
