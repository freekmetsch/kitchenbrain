import { describe, expect, it, vi } from 'vitest';
import { MealPlanController, type MealPlanControllerData } from './controller.svelte';
import { toast } from '$lib/stores/toast.svelte';
import { PlannedServingsRegistry, type PlannedServingMeal } from '$lib/planned_servings_registry';

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
		rotationShortlists: { [weekStartDate]: { due: [], freezerLow: [] } },
		mealPlanPrefs: {
			weekStartDay: 2,
			groceryDay: null,
			planAheadWeeks: 4,
			dayPlanning: false
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

	it('settles temporary serving edits when an optimistic add rolls back', async () => {
		let resolveRequest!: (response: Response) => void;
		const fetcher = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					resolveRequest = resolve;
				})
		);
		const registry = new PlannedServingsRegistry({
			write: vi.fn<(mealId: number, servings: number) => Promise<PlannedServingMeal>>()
		});
		const controller = new MealPlanController(data('2026-07-01'), {
			fetcher,
			servingsRegistry: registry
		});

		const adding = controller.addMealOptimistic({
			weekStartDate: '2026-07-01',
			dinner: 'Lasagne',
			servings: 4
		});
		const temporary = controller.weeks[0].meals[0];
		const servingChange = controller.changeServings(temporary, 1);
		expect(registry.snapshot(temporary.id)).toMatchObject({ pending: true, desired: 5 });

		resolveRequest(new Response(null, { status: 500 }));

		await expect(adding).resolves.toBe(false);
		await expect(servingChange).resolves.toBeUndefined();
		expect(registry.snapshot(temporary.id)).toBeNull();
		expect(controller.pendingServings[temporary.id]).toBeUndefined();
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

	it('keeps rapid serving taps visible and persists the final target', async () => {
		let resolveFirst!: (meal: PlannedServingMeal) => void;
		let resolveSecond!: (meal: PlannedServingMeal) => void;
		const write = vi
			.fn<(mealId: number, servings: number) => Promise<PlannedServingMeal>>()
			.mockImplementationOnce(
				() => new Promise<PlannedServingMeal>((resolve) => (resolveFirst = resolve))
			)
			.mockImplementationOnce(
				() => new Promise<PlannedServingMeal>((resolve) => (resolveSecond = resolve))
			);
		const registry = new PlannedServingsRegistry({ write });
		const initial = data('2026-07-01');
		initial.weeks[0].meals = [
			{
				id: 7,
				weekStartDate: '2026-07-01',
				weekNumber: 31,
				dinner: 'Lasagne',
				recipeSlug: 'lasagne',
				servings: 4,
				status: 'planned',
				source: 'fresh',
				cookedDate: null,
				plannedDate: null,
				note: null,
				sortOrder: 0,
				createdAt: new Date('2026-07-01T10:00:00Z')
			}
		];
		const controller = new MealPlanController(initial, { servingsRegistry: registry });
		const meal = controller.weeks[0].meals[0];

		const first = controller.changeServings(meal, 1);
		const second = controller.changeServings(meal, 1);

		expect(controller.weeks[0].meals[0].servings).toBe(6);
		expect(controller.pendingServings[7]).toBe(true);
		resolveFirst({ id: 7, servings: 5 });
		await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
		resolveSecond({ id: 7, servings: 6 });
		await Promise.all([first, second]);

		expect(controller.weeks[0].meals[0].servings).toBe(6);
		expect(controller.pendingServings[7]).toBeUndefined();
	});

	it('lets a planned rotation row be undone back into its shortlist lane', async () => {
		const weekStartDate = '2026-07-01';
		const candidate = {
			key: `${weekStartDate}:lasagne:cook:never:0:none:weekly:`,
			id: 3,
			slug: 'lasagne',
			title: 'Lasagne',
			titleEn: null,
			action: 'cook' as const,
			source: 'fresh' as const,
			servings: 4,
			onHandPortions: 0,
			targetPortions: null,
			reason: { code: 'cadence_due' as const, dueDate: '2026-06-24' }
		};
		const initial = data(weekStartDate);
		initial.rotationShortlists[weekStartDate].due = [candidate];
		const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			if (init?.method === 'DELETE') return new Response(null, { status: 200 });
			return new Response(
				JSON.stringify({
					id: 7,
					weekStartDate,
					weekNumber: 31,
					dinner: 'Lasagne',
					recipeSlug: 'lasagne',
					servings: 4,
					status: 'planned',
					source: 'fresh',
					cookedDate: null,
					plannedDate: null,
					note: null,
					sortOrder: 0,
					createdAt: new Date().toISOString()
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		});
		const registry = new PlannedServingsRegistry({
			write: vi.fn<(mealId: number, servings: number) => Promise<PlannedServingMeal>>()
		});
		const discard = vi.spyOn(registry, 'discard');
		const controller = new MealPlanController(initial, { fetcher, servingsRegistry: registry });

		await controller.planRotationCandidate(weekStartDate, candidate);

		expect(controller.weeks[0].meals).toHaveLength(1);
		expect(controller.rotationShortlists[weekStartDate].due).toEqual([]);
		expect(toast.current?.action?.label).toBe('Undo');

		toast.current?.action?.run();
		await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
		await vi.waitFor(() => expect(controller.weeks[0].meals).toEqual([]));
		expect(discard).toHaveBeenCalledWith(7);
		expect(controller.rotationShortlists[weekStartDate].due).toEqual([candidate]);
		toast.dismiss();
	});

	it('restores edited servings and notes when a deleted meal is undone', async () => {
		const original = {
			id: 7,
			weekStartDate: '2026-07-01',
			weekNumber: 31,
			dinner: 'Lasagne',
			recipeSlug: 'lasagne',
			servings: 5,
			status: 'planned' as const,
			source: 'fresh' as const,
			cookedDate: null,
			plannedDate: '2026-07-02',
			note: 'Use the large dish',
			sortOrder: 0,
			createdAt: new Date('2026-07-01T10:00:00Z')
		};
		let restoreBody: Record<string, unknown> | undefined;
		const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			if (init?.method === 'DELETE') return new Response(null, { status: 200 });
			restoreBody = JSON.parse(String(init?.body));
			return new Response(JSON.stringify({ ...original, id: 8 }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		});
		const initial = data('2026-07-01');
		initial.weeks[0].meals = [original];
		const controller = new MealPlanController(initial, { fetcher });

		await controller.removeMeal(original);
		toast.current?.action?.run();
		await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
		await vi.waitFor(() => expect(controller.weeks[0].meals[0]?.id).toBe(8));

		expect(restoreBody).toMatchObject({
			servings: 5,
			plannedDate: '2026-07-02',
			note: 'Use the large dish'
		});
		expect(controller.weeks[0].meals[0]).toMatchObject({
			id: 8,
			servings: 5,
			note: 'Use the large dish'
		});
		toast.dismiss();
	});
});
