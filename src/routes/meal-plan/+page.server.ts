import type { PageServerLoad } from './$types';
import { loadMealPlanPage } from '$lib/server/workflows/meal-plan-page';

export const load: PageServerLoad = async ({ url }) => loadMealPlanPage(url);
