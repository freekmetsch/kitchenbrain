import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '$lib/server/test_db';
import {
	claimAhPreviewToken,
	clearAhPreviewTokensForTest
} from '$lib/server/ah/preview_tokens';

const state = vi.hoisted(() => ({
	db: null as unknown as TestDb,
	view: null as unknown,
	searchProducts: vi.fn(),
	getProductsByIds: vi.fn(),
	aiArchetypePicks: vi.fn()
}));

vi.mock('$lib/server/db/index', () => ({ get db() { return state.db; } }));
vi.mock('$lib/server/domains/shopping', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/domains/shopping')>()),
	getShoppingWeekView: () => state.view
}));
vi.mock('$lib/server/workflows/reconcile-shopping', () => ({
	initializeShoppingSourceData: vi.fn(),
	materializeShoppingWeek: vi.fn()
}));
vi.mock('$lib/server/meal_plan/prefs', () => ({ getWeekStartDay: () => 2 }));
vi.mock('$lib/server/ah/ai_pick', () => ({ aiArchetypePicks: state.aiArchetypePicks }));
vi.mock('$lib/server/ah/client', () => ({
	searchProducts: state.searchProducts,
	getProductsByIds: state.getProductsByIds,
	getActiveOrder: vi.fn(),
	addProductItems: vi.fn(),
	addFreetextItems: vi.fn(),
	addProductsToOrder: vi.fn(),
	getAHStatus: () => ({ connected: true, memberName: 'Test household' }),
	AHNotConnectedError: class extends Error {},
	AH_NOT_CONNECTED: 'not_connected'
}));

import { PATCH, POST } from './+server';

const WEEK = '2026-07-22';

describe('AH preview projection', () => {
	beforeEach(() => {
		clearAhPreviewTokensForTest();
		vi.clearAllMocks();
		state.db = createTestDb();
		state.getProductsByIds.mockResolvedValue([]);
		state.aiArchetypePicks.mockResolvedValue(new Map());
		state.searchProducts.mockResolvedValue({
			ok: true,
			products: [{
				id: 'ah-tomaten',
				name: 'AH Tomaten',
				priceBeforeBonus: 2.49,
				currentPrice: 2.49,
				isBonus: false,
				bonusMechanism: null,
				salesUnitSize: '500 g',
				unitPriceDescription: 'prijs per kg €4.98',
				imageUrl: null,
				isPreviouslyBought: false,
				mainCategory: null
			}]
		});
		state.view = {
			toBuy: [{
				entryIds: [11, 12],
				name: 'tomaten',
				amount: null,
				unit: null,
				incompatibleQuantities: true,
				covered: false,
				sources: [
					{
						id: 11,
						revision: 3,
						name: 'tomaten',
						term: 'tomaten',
						amount: '2',
						unit: 'stuks',
						recipeTitle: 'Tomatensoep',
						approvedTerms: ['tomaten']
					},
					{
						id: 12,
						revision: 4,
						name: 'tomaten',
						term: 'tomaten',
						amount: '1',
						unit: 'blik',
						recipeTitle: 'Pastasaus',
						approvedTerms: ['tomaten']
					}
				]
			}]
		};
	});

	it('searches one unchanged Dutch term and binds every incompatible source without a pack guess', async () => {
		const response = await POST({
			request: new Request('http://localhost/api/shopping/ah-preview', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ weekStart: WEEK, entryIds: [11, 12] })
			}),
			locals: { user: { id: 7, username: 'test' } }
		} as never);
		const body = await response.json();

		expect(state.searchProducts).toHaveBeenCalledTimes(1);
		expect(state.searchProducts).toHaveBeenCalledWith('tomaten', 24);
		expect(body.items).toHaveLength(1);
		expect(body.items[0]).toMatchObject({
			ref: 'entries:11,12',
			sourceName: 'tomaten',
			term: 'tomaten',
			amount: null,
			unit: null,
			incompatibleQuantities: true,
			quantitySources: [
				{ amount: '2', unit: 'stuks', recipeTitle: 'Tomatensoep' },
				{ amount: '1', unit: 'blik', recipeTitle: 'Pastasaus' }
			],
			candidates: [{ id: 'ah-tomaten', qty: null }]
		});

		expect(claimAhPreviewToken(body.previewToken, 7)?.items[0]).toMatchObject({
			ref: 'entries:11,12',
			entryIds: [11, 12],
			entryRevisions: [3, 4],
			term: 'tomaten',
			amount: null,
			unit: null,
			incompatibleQuantities: true,
			quantitySummary: '2 stuks + 1 blik'
		});
	});

	it('renews only an authenticated current preview', async () => {
		const previewResponse = await POST({
			request: new Request('http://localhost/api/shopping/ah-preview', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ weekStart: WEEK, entryIds: [11, 12] })
			}),
			locals: { user: { id: 7, username: 'test' } }
		} as never);
		const { previewToken } = await previewResponse.json();

		const renewed = await PATCH({
			request: new Request('http://localhost/api/shopping/ah-preview', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ previewToken })
			}),
			locals: { user: { id: 7, username: 'test' } }
		} as never);
		expect(await renewed.json()).toEqual({ ok: true });

		await expect(
			PATCH({
				request: new Request('http://localhost/api/shopping/ah-preview', {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ previewToken })
				}),
				locals: { user: { id: 8, username: 'other' } }
			} as never)
		).rejects.toMatchObject({ status: 409 });
	});
});
