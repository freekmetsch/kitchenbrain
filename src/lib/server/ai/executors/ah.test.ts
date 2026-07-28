import { describe, expect, it, vi } from 'vitest';
import { createTestDb } from '$lib/server/test_db';
import type { AHProduct } from '$lib/server/ah/client';
import { createAhExecutors } from './ah';

const product: AHProduct = {
	id: '123',
	name: 'AH Kikkererwten',
	priceBeforeBonus: 1.19,
	currentPrice: null,
	isBonus: false,
	bonusMechanism: null,
	salesUnitSize: '400 g',
	unitPriceDescription: 'prijs per kg €2.98',
	imageUrl: 'https://example.test/product.jpg',
	isPreviouslyBought: true,
	mainCategory: 'Conserven'
};

describe('search_ah_products', () => {
	it('forwards bounded Dutch queries and returns sanitized read-only evidence', async () => {
		const search = vi.fn(async () => ({ ok: true as const, products: [product] }));
		const executor = createAhExecutors(search).search_ah_products;
		const db = createTestDb();
		const beforeRows = db.select().from((await import('$lib/server/db/schema')).inventoryItems).all().length;

		const result = (await executor(
			{ queries: ['Kikkererwten blik', 'KIKKERERWTEN BLIK'] },
			db,
			1
		)) as Record<string, unknown>;

		expect(search).toHaveBeenCalledOnce();
		expect(search).toHaveBeenCalledWith('kikkererwten blik', 5);
		expect(result).toMatchObject({ ok: true, count: 1 });
		expect(result.searches).toEqual([
			{
				query: 'kikkererwten blik',
				available: true,
				products: [
					expect.objectContaining({
						product_id: '123',
						name: 'AH Kikkererwten',
						package_size: '400 g',
						price: 1.19,
						previously_bought: true
					})
				]
			}
		]);
		expect(JSON.stringify(result)).not.toContain('imageUrl');
		expect(db.select().from((await import('$lib/server/db/schema')).inventoryItems).all()).toHaveLength(
			beforeRows
		);
	});

	it('reports unavailable searches explicitly and never invents products', async () => {
		const executor = createAhExecutors(async () => ({ ok: false })).search_ah_products;
		const result = (await executor({ queries: ['verse koriander'] }, createTestDb(), 1)) as Record<
			string,
			unknown
		>;

		expect(result).toMatchObject({
			ok: false,
			error: expect.stringContaining('unavailable'),
			searches: [{ query: 'verse koriander', available: false, products: [] }]
		});
	});

	it('refuses more than five queries before making a network call', async () => {
		const search = vi.fn(async () => ({ ok: true as const, products: [] }));
		const executor = createAhExecutors(search).search_ah_products;

		await expect(
			executor(
				{ queries: ['een', 'twee', 'drie', 'vier', 'vijf', 'zes'] },
				createTestDb(),
				1
			)
		).rejects.toThrow();
		expect(search).not.toHaveBeenCalled();
	});
});
