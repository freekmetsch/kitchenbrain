import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearAhPreviewTokensForTest,
	createAhPreviewToken,
	peekAhPreviewToken
} from '$lib/server/ah/preview_tokens';

const state = vi.hoisted(() => ({ searchProducts: vi.fn() }));

vi.mock('$lib/server/ah/client', () => ({
	searchProducts: state.searchProducts,
	getProductsByIds: vi.fn(),
	addProductItems: vi.fn(),
	addFreetextItems: vi.fn(),
	getActiveOrder: vi.fn(),
	addProductsToOrder: vi.fn(),
	getAHStatus: () => ({ connected: true, memberName: 'Test household' }),
	AHNotConnectedError: class extends Error {},
	AH_NOT_CONNECTED: 'not_connected'
}));

import { POST } from './+server';

function tokenFor(userId: number): string {
	return createAhPreviewToken({
		userId,
		weekStart: '2026-07-22',
		items: [
			{
				ref: 'entries:1',
				entryIds: [1],
				entryRevisions: [1],
				term: 'pasta',
				amount: '400',
				unit: 'g',
				offeredProducts: []
			}
		]
	});
}

function search(previewToken: string, ref = 'entries:1', query = 'volkoren penne') {
	return POST({
		request: new Request('http://localhost/api/shopping/ah-search', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ previewToken, ref, query })
		}),
		locals: { user: { id: 7, username: 'test' } }
	} as never);
}

describe('AH row search', () => {
	beforeEach(() => {
		clearAhPreviewTokensForTest();
		vi.clearAllMocks();
		state.searchProducts.mockResolvedValue({
			ok: true,
			products: [
				{
					id: 'ah-penne',
					name: 'AH Volkoren penne',
					priceBeforeBonus: 2.49,
					currentPrice: null,
					isBonus: false,
					bonusMechanism: null,
					salesUnitSize: '500 g',
					unitPriceDescription: '€4.98/kg',
					imageUrl: null,
					isPreviouslyBought: false,
					mainCategory: null
				}
			]
		});
	});

	it('searches a bound row and adds the result to its existing preview token', async () => {
		const previewToken = tokenFor(7);
		const response = await search(previewToken);
		expect(await response.json()).toMatchObject({
			ok: true,
			candidates: [{ id: 'ah-penne', name: 'AH Volkoren penne' }]
		});
		expect(state.searchProducts).toHaveBeenCalledWith('volkoren penne', 24);
		expect(peekAhPreviewToken(previewToken, 7)?.items[0].offeredProducts).toEqual([
			{ id: 'ah-penne', name: 'AH Volkoren penne' }
		]);
	});

	it('rejects an invented row and blank query', async () => {
		const previewToken = tokenFor(7);
		await expect(search(previewToken, 'entries:999')).rejects.toMatchObject({ status: 409 });
		await expect(search(previewToken, 'entries:1', '   ')).rejects.toMatchObject({ status: 400 });
	});

	it('rejects an unauthenticated request', async () => {
		const previewToken = tokenFor(7);
		await expect(
			POST({
				request: new Request('http://localhost/api/shopping/ah-search', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ previewToken, ref: 'entries:1', query: 'penne' })
				}),
				locals: {}
			} as never)
		).rejects.toMatchObject({ status: 401 });
	});
});
