import { describe, expect, it, vi } from 'vitest';
import { createTestDb } from '$lib/server/test_db';
import type { AHProduct } from '$lib/server/ah/client';
import { createTurnSafetyState } from '$lib/server/ai/turn_safety';
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
		const safety = createTurnSafetyState();
		const beforeRows = db.select().from((await import('$lib/server/db/schema')).inventoryItems).all().length;

		const result = (await executor(
			{ queries: ['Kikkererwten blik', 'KIKKERERWTEN BLIK'] },
			db,
			1,
			undefined,
			safety
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
						name: 'AH Kikkererwten',
						package_size: '400 g',
						price: 1.19,
						previously_bought: true
					})
				]
			}
		]);
		expect(JSON.stringify(result)).not.toContain('product_id');
		expect([...safety.ahEvidence.values()]).toEqual([
			expect.objectContaining({ productId: '123', productName: 'AH Kikkererwten' })
		]);
		expect(JSON.stringify(result)).not.toContain('imageUrl');
		expect(db.select().from((await import('$lib/server/db/schema')).inventoryItems).all()).toHaveLength(
			beforeRows
		);
	});

	it('reuses normalized queries and enforces the fifteen-query turn budget', async () => {
		const search = vi.fn(async () => ({ ok: true as const, products: [product] }));
		const executor = createAhExecutors(search).search_ah_products;
		const safety = createTurnSafetyState();
		const db = createTestDb();

		await executor({ queries: ['Kikkererwten blik'] }, db, 1, undefined, safety);
		await executor({ queries: ['  KIKKERERWTEN BLIK  '] }, db, 1, undefined, safety);
		expect(search).toHaveBeenCalledOnce();

		for (let batch = 0; batch < 2; batch += 1) {
			await executor(
				{ queries: Array.from({ length: 5 }, (_, index) => `zoekterm ${batch}-${index}`) },
				db,
				1,
				undefined,
				safety
			);
		}
		await executor(
			{ queries: ['zoekterm extra-1', 'zoekterm extra-2', 'zoekterm extra-3', 'zoekterm extra-4'] },
			db,
			1,
			undefined,
			safety
		);
		expect(safety.ahSearchCache).toHaveLength(15);
		const blocked = await executor(
			{ queries: ['zoekterm zestien'] },
			db,
			1,
			undefined,
			safety
		);
		expect(blocked).toMatchObject({
			ok: false,
			contract_error: 'query_budget_exhausted'
		});
		expect(search).toHaveBeenCalledTimes(15);
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
