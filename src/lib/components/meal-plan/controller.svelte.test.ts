import { describe, expect, it, vi } from 'vitest';
import { MealPlanController, type MealPlanControllerData } from './controller.svelte';

function data(weekStartDate: string): MealPlanControllerData {
	return {
		weeks: [
			{
				weekStartDate,
				weekNumber: 31,
				deliveryDate: null,
				meals: []
			}
		],
		currentWeekStart: weekStartDate,
		focusWeek: null,
		recipeList: [],
		showPastWeeks: false,
		hasPastWeeks: false,
		freezerPromptSummary: '',
		recentlyCookedSummary: '',
		mealPlanPrefs: {
			weekStartDay: 2,
			groceryDay: null,
			planAheadWeeks: 4,
			dayPlanning: false,
			repeatCycleDays: 14,
			suggestCount: 5
		}
	};
}

describe('MealPlanController', () => {
	it('keeps state isolated across component instances', () => {
		const first = new MealPlanController(data('2026-07-01'));
		const second = new MealPlanController(data('2026-07-08'));

		first.openAddDrawer('2026-07-01');

		expect(first.drawerOpen).toBe(true);
		expect(first.drawerWeek).toBe('2026-07-01');
		expect(second.drawerOpen).toBe(false);
		expect(second.drawerWeek).toBe('');
		expect(second.weeks[0].weekStartDate).toBe('2026-07-08');
	});

	it('rolls an optimistic add back when the request fails', async () => {
		const fetcher = vi.fn(async () => new Response(null, { status: 500 }));
		const controller = new MealPlanController(data('2026-07-01'), {
			basePath: '',
			fetcher
		});

		const added = await controller.addMealOptimistic({
			weekStartDate: '2026-07-01',
			dinner: 'Lasagne'
		});

		expect(added).toBe(false);
		expect(controller.weeks[0].meals).toEqual([]);
		expect(controller.pendingAdds).toEqual({});
	});

	it('coalesces rapid duplicate adds while the first request is pending', async () => {
		let resolveRequest!: (response: Response) => void;
		const fetcher = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					resolveRequest = resolve;
				})
		);
		const controller = new MealPlanController(data('2026-07-01'), {
			basePath: '',
			fetcher
		});
		const input = { weekStartDate: '2026-07-01', dinner: 'Lasagne' };

		const first = controller.addMealOptimistic(input);
		const duplicate = await controller.addMealOptimistic(input);
		expect(duplicate).toBe(false);
		expect(fetcher).toHaveBeenCalledTimes(1);

		resolveRequest(
			new Response(
				JSON.stringify({
					id: 7,
					weekStartDate: '2026-07-01',
					weekNumber: 31,
					dinner: 'Lasagne',
					recipeSlug: null,
					servings: null,
					status: 'planned',
					source: 'fresh',
					cookedDate: null,
					plannedDate: null,
					note: null,
					sortOrder: 0,
					createdAt: new Date().toISOString()
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			)
		);
		expect(await first).toBe(true);
		expect(controller.weeks[0].meals).toHaveLength(1);
		expect(controller.weeks[0].meals[0].id).toBe(7);
	});
});
