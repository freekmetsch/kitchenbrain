import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import type { ShoppingListItem } from '$lib/components/shopping/types';
import { loadShoppingPage } from '$lib/server/workflows/reconcile-shopping';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, '/login');
	const page = loadShoppingPage(url.searchParams.get('week'));
	const { shopping, needs } = page;
	const items: ShoppingListItem[] = [...shopping.toBuy, ...shopping.done].map((row) => ({
		name: row.name,
		amount: row.amount,
		unit: row.unit,
		bought: row.bought,
		manual: row.sources.every((source) => source.sourceKind === 'manual'),
		manualContribution: row.sources.some((source) => source.amountOverridden),
		included: true,
		selectedName: row.name,
		covered: row.covered,
		incompatibleQuantities: row.incompatibleQuantities,
		entryIds: row.entryIds,
		sources: row.sources
	}));

	return {
		weekStart: page.weekStart,
		currentWeekStart: page.currentWeekStart,
		prevWeek: page.prevWeek,
		nextWeek: page.nextWeek,
		isDefaultWeek: page.isDefaultWeek,
		isEditable: page.isEditable,
		deliveryDate: page.deliveryDate,
		emptyState: page.emptyState,
		ah: page.ah,
		items,
		plannedMeals: page.plannedMeals,
		sources: shopping.sources,
		excluded: shopping.excluded,
		recurring: shopping.recurring,
		legacy: shopping.legacy,
		mealsWithoutRecipe: needs.mealsWithoutRecipe,
		freezerMeals: needs.freezerMeals,
		freezerMealsMissingFreshInfo: needs.freezerMealsMissingFreshInfo,
		pushHistory: page.pushHistory
	};
};
