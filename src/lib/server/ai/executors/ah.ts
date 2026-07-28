import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { searchProducts, type SearchOutcome } from '$lib/server/ah/client';
import type { ExecutorFn } from './shared';

type SearchProducts = (query: string, size?: number) => Promise<SearchOutcome>;
const MAX_UNIQUE_QUERIES_PER_TURN = 15;

export function createAhExecutors(search: SearchProducts = searchProducts): Record<string, ExecutorFn> {
	return {
		async search_ah_products(raw, _db, _userId, _precondition, turnSafety) {
			const input = z
				.object({
					queries: z.array(z.string().trim().min(2).max(100)).min(1).max(5)
				})
				.strict()
				.parse(raw);
			const queries = [...new Set(input.queries.map((query) => query.toLocaleLowerCase('nl-NL')))];
			const unseenQueries = turnSafety
				? queries.filter((query) => !turnSafety.ahSearchCache.has(query))
				: queries;
			if (
				turnSafety &&
				turnSafety.ahSearchCache.size + unseenQueries.length > MAX_UNIQUE_QUERIES_PER_TURN
			) {
				return {
					ok: false,
					error: 'AH_SEARCH_BUDGET_EXHAUSTED',
					contract_error: 'query_budget_exhausted',
					searches: queries
						.map((query) => turnSafety.ahSearchCache.get(query))
						.filter((result) => result !== undefined)
				};
			}
			const searches = await Promise.all(
				queries.map(async (query) => {
					const cached = turnSafety?.ahSearchCache.get(query);
					if (cached) return cached;
					const outcome = await search(query, 5);
					if (!outcome.ok) {
						const unavailable = {
							query,
							available: false as const,
							products: []
						};
						turnSafety?.ahSearchCache.set(query, unavailable);
						return unavailable;
					}
					const result = {
						query,
						available: true as const,
						products: outcome.products.slice(0, 5).map((product) => {
							const evidenceKey = randomUUID();
							turnSafety?.ahEvidence.set(evidenceKey, {
								key: evidenceKey,
								source: 'ah',
								query,
								productId: product.id,
								productName: product.name,
								packageSize: product.salesUnitSize,
								price: product.currentPrice ?? product.priceBeforeBonus
							});
							return {
								evidence_key: evidenceKey,
								name: product.name,
								package_size: product.salesUnitSize,
								price: product.currentPrice ?? product.priceBeforeBonus,
								unit_price: product.unitPriceDescription,
								bonus: product.isBonus,
								previously_bought: product.isPreviouslyBought,
								category: product.mainCategory
							};
						})
					};
					turnSafety?.ahSearchCache.set(query, result);
					return result;
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
