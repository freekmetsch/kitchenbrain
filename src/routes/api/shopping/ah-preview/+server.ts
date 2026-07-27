import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { searchProducts, getProductsByIds, getAHStatus, AH_NOT_CONNECTED, type AHProduct, type SearchOutcome } from '$lib/server/ah/client';
import { rankProducts, deriveQuantity, effectiveUnitPrice, pricePerCount, toSearchTerm, fallbackTerm, normalize } from '$lib/server/ah/matching';
import { aiArchetypePicks } from '$lib/server/ah/ai_pick';
import { db } from '$lib/server/db/index';
import * as schema from '$lib/server/db/schema';
import type { PreviewItem, PreviewProduct } from '$lib/shopping_ah';
import { readJsonBody } from '$lib/server/api_body';
import { isoDateSchema } from '$lib/date_schema';
import { getShoppingWeekView } from '$lib/server/shopping_view';
import { createAhPreviewToken, isAhEligibleShoppingRow } from '$lib/server/ah/preview_tokens';
import { initializeShoppingSourceData, materializeShoppingWeek } from '$lib/server/shopping_entries';
import { getWeekStartDay } from '$lib/server/meal_plan/prefs';

function toPreviewProduct(
	product: AHProduct,
	amount: string | null,
	unit: string | null,
	incompatibleQuantities: boolean
): PreviewProduct {
	const unitPrice = effectiveUnitPrice(product);
	return {
		id: product.id, name: product.name, price: product.currentPrice ?? product.priceBeforeBonus,
		regularPrice: product.priceBeforeBonus, isBonus: product.isBonus, bonusMechanism: product.bonusMechanism,
		salesUnitSize: product.salesUnitSize, unitPrice: unitPrice ? `€${unitPrice.value.toFixed(2)}/${unitPrice.basis}` : null,
		imageUrl: product.imageUrl, isPreviouslyBought: product.isPreviouslyBought,
		qty: incompatibleQuantities ? null : deriveQuantity(amount, unit, product.salesUnitSize),
		pricePerCount: pricePerCount(product)
	};
}

function quantitySources(row: ReturnType<typeof getShoppingWeekView>['toBuy'][number]) {
	return row.sources.map((source) => ({
		name: source.name,
		amount: source.amount,
		unit: source.unit,
		recipeTitle: source.recipeTitle
	}));
}

function quantitySummary(row: ReturnType<typeof getShoppingWeekView>['toBuy'][number]): string | null {
	if (!row.incompatibleQuantities) return null;
	const parts = row.sources
		.map((source) => [source.amount, source.unit].filter(Boolean).join(' '))
		.filter(Boolean);
	return parts.length ? parts.join(' + ') : null;
}

const BodySchema = z.object({
	weekStart: isoDateSchema,
	entryIds: z.array(z.number().int().positive()).min(1).max(200)
}).strict();
const SEARCH_POOL = 24;
const DEFAULT_CANDIDATES = 10;

async function searchWithFallback(name: string): Promise<{ outcome: SearchOutcome; used: string }> {
	const cleaned = toSearchTerm(name);
	const outcome = await searchProducts(cleaned, SEARCH_POOL);
	if (outcome.ok && !outcome.products.length) {
		const retry = fallbackTerm(cleaned);
		if (retry) {
			const second = await searchProducts(retry, SEARCH_POOL);
			if (second.ok && second.products.length) return { outcome: second, used: retry };
		}
	}
	return { outcome, used: cleaned };
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	if (!getAHStatus().connected) return json({ ok: false, reason: AH_NOT_CONNECTED });
	const body = await readJsonBody(request, BodySchema);
	initializeShoppingSourceData(db);
	materializeShoppingWeek(db, body.weekStart, { weekStartDay: getWeekStartDay(db) });
	const requested = new Set(body.entryIds);
	const rows = getShoppingWeekView(db, body.weekStart).toBuy
		.filter(isAhEligibleShoppingRow)
		.filter((row) => row.entryIds.some((id) => requested.has(id)));
	const represented = new Set(rows.flatMap((row) => row.entryIds));
	if ([...requested].some((id) => !represented.has(id))) error(409, 'The shopping list changed; review it again');

	const favorites = new Map(db.select().from(schema.ahFavorites).all().map((favorite) => [favorite.nameKey, favorite]));
	const items: PreviewItem[] = await Promise.all(rows.map(async (row): Promise<PreviewItem> => {
		const ref = `entries:${[...row.entryIds].sort((a, b) => a - b).join(',')}`;
		const purchaseForm = row.sources.find((source) => source.purchaseForm)?.purchaseForm;
		const { outcome, used } = await searchWithFallback(row.name);
		const sourceAmounts = quantitySources(row);
		if (!outcome.ok) return { ref, sourceName: row.name, term: row.name, amount: row.amount, unit: row.unit, incompatibleQuantities: row.incompatibleQuantities, quantitySources: sourceAmounts, purchaseForm, status: 'unknown', candidates: [], lowConfidence: false };
		if (!outcome.products.length) return { ref, sourceName: row.name, term: row.name, amount: row.amount, unit: row.unit, incompatibleQuantities: row.incompatibleQuantities, quantitySources: sourceAmounts, purchaseForm, status: 'freetext', candidates: [], lowConfidence: false };
		const { ranked, lowConfidence } = rankProducts(used, outcome.products, purchaseForm);
		return { ref, sourceName: row.name, term: row.name, amount: row.amount, unit: row.unit, incompatibleQuantities: row.incompatibleQuantities, quantitySources: sourceAmounts, purchaseForm, status: 'product', candidates: ranked.slice(0, DEFAULT_CANDIDATES).map((product) => toPreviewProduct(product, row.amount, row.unit, row.incompatibleQuantities)), lowConfidence };
	}));

	const missingFavorites: { item: PreviewItem; productId: string }[] = [];
	for (const item of items) {
		if (item.status === 'unknown') continue;
		const favorite = favorites.get(normalize(item.term));
		if (!favorite) continue;
		const index = item.candidates.findIndex((candidate) => candidate.id === favorite.productId);
		if (index >= 0) {
			const [candidate] = item.candidates.splice(index, 1);
			item.candidates.unshift({ ...candidate, isFavorite: true });
		} else missingFavorites.push({ item, productId: favorite.productId });
	}
	if (missingFavorites.length) {
		const fetched = new Map((await getProductsByIds([...new Set(missingFavorites.map((item) => item.productId))])).map((product) => [product.id, product]));
		for (const { item, productId } of missingFavorites) {
			const product = fetched.get(productId);
			if (!product) continue;
			item.candidates.unshift({ ...toPreviewProduct(product, item.amount, item.unit, item.incompatibleQuantities), isFavorite: true });
			item.status = 'product';
			item.lowConfidence = false;
		}
	}
	const adjustable = items.filter((item) => item.status === 'product' && !item.candidates[0]?.isFavorite && item.candidates.length > 1);
	const picks = await aiArchetypePicks(adjustable);
	for (const item of adjustable) {
		const index = picks.get(item.ref);
		if (index !== undefined && index > 0 && index < item.candidates.length) {
			const [candidate] = item.candidates.splice(index, 1);
			item.candidates.unshift(candidate);
		}
	}
	const byRef = new Map(rows.map((row) => [`entries:${[...row.entryIds].sort((a, b) => a - b).join(',')}`, row]));
	const previewToken = createAhPreviewToken({
		userId: locals.user.id,
		weekStart: body.weekStart,
		items: items.map((item) => {
			const row = byRef.get(item.ref)!;
			return {
				ref: item.ref,
				entryIds: row.entryIds,
				entryRevisions: row.sources.map((source) => source.revision),
				term: item.term,
				amount: item.amount,
				unit: item.unit,
				incompatibleQuantities: item.incompatibleQuantities,
				quantitySummary: quantitySummary(row),
				offeredProducts: item.candidates.map((candidate) => ({ id: candidate.id, name: candidate.name }))
			};
		})
	});
	return json({ ok: true, previewToken, items });
};
