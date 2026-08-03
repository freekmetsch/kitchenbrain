import { describe, expect, it, vi } from 'vitest';
import type { Item } from './shared';
import {
	InventoryController,
	type InventoryControllerData,
	type InventoryControllerDependencies
} from './controller.svelte';

function item(id: number, qtyNum = 1): Item {
	const now = new Date('2026-07-27T10:00:00Z');
	return {
		id,
		name: `Item ${id}`,
		qtyText: `${qtyNum} portions`,
		qtyNum,
		unit: 'portions',
		section: 'freezer',
		category: 'meal',
		kind: 'leftover',
		foodClass: 'main',
		madeFromRecipeId: null,
		recipeStatus: null,
		recipeStatusAt: null,
		needsReview: false,
		reviewReason: null,
		isStaple: false,
		expiryDate: null,
		tags: [],
		createdAt: now,
		updatedAt: now,
		deletedAt: null
	};
}

function data(items: Item[]): InventoryControllerData {
	return {
		items,
		recipeLinks: {},
		recipeMatches: {},
		recipeOptions: [],
		stapleGhosts: [],
		todayIso: '2026-07-27',
		currentWeekStart: '2026-07-21'
	};
}

function response(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function dependencies(
	fetch: InventoryControllerDependencies['fetch']
): InventoryControllerDependencies {
	return {
		fetch,
		invalidate: vi.fn(async () => {}),
		patchKeepStocked: vi.fn(async () => true),
		showToast: vi.fn(),
		dismissToast: vi.fn()
	};
}

describe('InventoryController', () => {
	it('keeps state isolated between two page instances', () => {
		const source = data([item(1)]);
		const first = new InventoryController(source, dependencies(vi.fn()));
		const second = new InventoryController(source, dependencies(vi.fn()));

		first.searchQuery = 'different';
		first.items[0].qtyNum = 9;

		expect(second.searchQuery).toBe('');
		expect(second.items[0].qtyNum).toBe(1);
		expect(source.items[0].qtyNum).toBe(1);
	});

	it('opens recipe review as a focused unresolved-meal view and restores the normal list', () => {
		const unresolved = item(1);
		const planned = { ...item(2), recipeStatus: 'plan_to_add' as const };
		const ingredient = { ...item(3), kind: 'ingredient' as const, category: 'ingredient' };
		const controller = new InventoryController(
			data([unresolved, planned, ingredient]),
			dependencies(vi.fn())
		);

		expect(controller.unresolvedRelationshipCount).toBe(1);
		expect(controller.visibleMealItems.map(({ id }) => id)).toEqual([1, 2]);

		controller.openRelationshipReview();
		expect(controller.relationshipReviewOnly).toBe(true);
		expect(controller.scope).toBe('meals');
		expect(controller.visibleMealItems.map(({ id }) => id)).toEqual([1]);

		controller.closeRelationshipReview();
		expect(controller.visibleMealItems.map(({ id }) => id)).toEqual([1, 2]);
	});

	it('keeps an empty unresolved meal visible while reviewing recipe upkeep', () => {
		const controller = new InventoryController(data([item(1, 0)]), dependencies(vi.fn()));

		expect(controller.mealLedger).toEqual([]);
		controller.openRelationshipReview();
		expect(controller.mealLedger.map((entry) => entry.name)).toEqual(['Item 1']);
	});

	it('projects live and cook-again meals into one alphabetic ledger', () => {
		const banana = {
			...item(2, 0),
			name: 'Banana curry',
			madeFromRecipeId: 7
		};
		const apple = { ...item(1, 2), name: 'Apple stew' };
		const hidden = { ...item(3, 0), name: 'Carrot soup' };
		const source = data([banana, apple, hidden]);
		source.recipeLinks[7] = {
			title: 'Banana curry',
			titleNl: 'Bananencurry',
			slug: 'banana-curry',
			isFreezerStaple: true,
			targetPortions: 6,
			onHandPortions: 0
		};
		source.stapleGhosts = [
			{ recipeId: 8, slug: 'date-tagine', title: 'Date tagine', target: 4 }
		];
		const controller = new InventoryController(source, dependencies(vi.fn()));

		expect(controller.mealLedger.map((entry) => [entry.kind, entry.name])).toEqual([
			['item', 'Apple stew'],
			['item', 'Banana curry'],
			['ghost', 'Date tagine']
		]);
	});

	it('keeps non-meal rows alphabetic when review state changes', () => {
		const zucchini = {
			...item(1),
			name: 'Zucchini',
			kind: 'ingredient' as const,
			category: 'ingredient'
		};
		const apple = {
			...item(2),
			name: 'Apple',
			kind: 'ingredient' as const,
			category: 'ingredient',
			needsReview: true
		};
		const controller = new InventoryController(data([zucchini, apple]), dependencies(vi.fn()));
		controller.setScope('ingredients');

		expect(controller.stockRows.map(({ name }) => name)).toEqual(['Apple', 'Zucchini']);
		controller.items[0].needsReview = true;
		controller.items[1].needsReview = false;
		expect(controller.stockRows.map(({ name }) => name)).toEqual(['Apple', 'Zucchini']);
	});

	it('coalesces rapid quantity taps and rolls back to the last confirmed value', async () => {
		const firstResponse = deferred<Response>();
		const requests: Array<{ qty_num: number; qty_text: string }> = [];
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			requests.push(JSON.parse(String(init?.body)));
			if (requests.length === 1) return firstResponse.promise;
			return response({}, 500);
		});
		const controller = new InventoryController(data([item(1)]), dependencies(fetchMock));
		const stock = controller.items[0];

		const settled = controller.stepQty(stock, 1);
		controller.stepQty(stock, 1);
		expect(stock.qtyNum).toBe(3);
		expect(requests).toEqual([{ qty_num: 2, qty_text: '2 portions' }]);

		firstResponse.resolve(response({ item: { ...stock, qtyNum: 2, qtyText: '2 portions' } }));
		await settled;

		expect(requests).toEqual([
			{ qty_num: 2, qty_text: '2 portions' },
			{ qty_num: 3, qty_text: '3 portions' }
		]);
		expect(stock.qtyNum).toBe(2);
	});

	it('restores an optimistically deleted item at its original position after undo', async () => {
		let undoBody: unknown;
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (init?.method === 'DELETE') return response({});
			if (url.endsWith('/api/inventory/undo')) {
				undoBody = JSON.parse(String(init?.body));
				return response({ item: item(1) });
			}
			throw new Error(`Unexpected request: ${url}`);
		});
		const deps = dependencies(fetchMock);
		const controller = new InventoryController(data([item(1), item(2)]), deps);

		await controller.deleteItem(controller.items[0]);
		expect(controller.items.map(({ id }) => id)).toEqual([2]);

		const undo = vi.mocked(deps.showToast).mock.calls.at(-1)?.[1]?.action?.run;
		expect(undo).toBeTypeOf('function');
		await undo?.();

		expect(undoBody).toEqual({ item_id: 1 });
		expect(controller.items.map(({ id }) => id)).toEqual([1, 2]);
	});

	it('keeps stored expiry untouched when another field is edited', async () => {
		const dated = { ...item(1), expiryDate: '2026-08-14' };
		let editBody: Record<string, unknown> | undefined;
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			editBody = JSON.parse(String(init?.body));
			return response({ item: { ...dated, name: 'Renamed meal' } });
		});
		const controller = new InventoryController(data([dated]), dependencies(fetchMock));

		controller.openEdit(controller.items[0]);
		expect(controller.editDraft).not.toHaveProperty('expiry');
		controller.editDraft.name = 'Renamed meal';
		await controller.saveEdit(controller.items[0]);

		expect(editBody).toEqual({ name: 'Renamed meal' });
		expect(controller.items[0].expiryDate).toBe('2026-08-14');
	});

	it('keeps activity and undo request failures recoverable', async () => {
		const deps = dependencies(vi.fn(async () => {
			throw new Error('offline');
		}));
		const controller = new InventoryController(data([item(1)]), deps);

		await expect(controller.openActivity()).resolves.toBeUndefined();
		expect(controller.activityLoading).toBe(false);
		expect(deps.showToast).toHaveBeenLastCalledWith('Could not load activity', {
			variant: 'error',
			action: undefined
		});

		await expect(
			controller.undoEvent({
				id: 9,
				opType: 'update',
				actorLabel: 'Test',
				itemId: 1,
				itemName: 'Item 1',
				summary: 'Changed quantity',
				createdAt: Date.now(),
				isUndo: false,
				undoable: true
			})
		).resolves.toBeUndefined();
		expect(deps.showToast).toHaveBeenLastCalledWith('Could not undo', {
			variant: 'error',
			action: undefined
		});
	});
});
