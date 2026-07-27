import type { PageServerLoad } from './$types';
import { loadInventoryPage } from '$lib/server/workflows/inventory-page';

export type { RecipeLink, RecipeMatch } from '$lib/server/domains/inventory/page';

export const load: PageServerLoad = async () => loadInventoryPage();
