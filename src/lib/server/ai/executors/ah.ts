import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { searchProducts, type SearchOutcome } from '$lib/server/ah/client';
import type { ExecutorFn } from './shared';

type SearchProducts = (query: string, size?: number) => Promise<SearchOutcome>;

export function createAhExecutors(search: SearchProducts = searchProducts): Record<string, ExecutorFn> {
	return {
		async search_ah_products(raw) {
			const input = z
				.object({
					queries: z.array(z.string().trim().min(2).max(100)).min(1).max(5)
				})
				.strict()
				.parse(raw);
			const queries = [...new Set(input.queries.map((query) => query.toLocaleLowerCase('nl-NL')))];
			const searches = await Promise.all(
				queries.map(async (query) => {
					const outcome = await search(query, 5);
					if (!outcome.ok) {
						return {
							query,
							available: false as const,
							products: []
						};
					}
					return {
						query,
						available: true as const,
						products: outcome.products.slice(0, 5).map((product) => ({
							evidence_key: randomUUID(),
							product_id: product.id,
							name: product.name,
							package_size: product.salesUnitSize,
							price: product.currentPrice ?? product.priceBeforeBonus,
							unit_price: product.unitPriceDescription,
							bonus: product.isBonus,
							previously_bought: product.isPreviouslyBought,
							category: product.mainCategory
						}))
					};
				})
			);
			const available = searches.filter((searchResult) => searchResult.available).length;
			if (available === 0) {
				return {
					ok: false,
					error: 'AH search is unavailable or the household AH account is not connected.',
					searches
				};
			}
			return {
				ok: true,
				count: searches.reduce((total, result) => total + result.products.length, 0),
				searches,
				...(available < searches.length
					? { warning: 'Some AH searches were unavailable; do not infer results for them.' }
					: {})
			};
		}
	};
}

export const ahExecutors = createAhExecutors();
