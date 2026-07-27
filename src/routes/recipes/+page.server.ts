import type { PageServerLoad } from './$types';
import { loadRecipeListData } from '$lib/server/workflows/recipe-pages';

export const load: PageServerLoad = async ({ url, parent, locals }) => {
	const { recipeLang } = await parent();
	return loadRecipeListData({
		url,
		recipeLang,
		userId: locals.user?.id
	});
};
