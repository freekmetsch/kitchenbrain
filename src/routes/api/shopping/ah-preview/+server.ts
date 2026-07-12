import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { searchProducts, getProductsByIds, getAHStatus, AH_NOT_CONNECTED, type AHProduct, type SearchOutcome } from '$lib/server/ah/client';
import { rankProducts, deriveQuantity, effectiveUnitPrice, toSearchTerm, fallbackTerm, normalize } from '$lib/server/ah/matching';
import { aiArchetypePicks } from '$lib/server/ah/ai_pick';
import { db } from '$lib/server/db/index';
import * as schema from '$lib/server/db/schema';
import type { PreviewItem, PreviewProduct } from '$lib/shopping_ah';
import { readJsonBody } from '$lib/server/api_body';

function toPreviewProduct(p: AHProduct, amount: string | null, unit: string | null): PreviewProduct {
	// Display the same bonus-adjusted unit price the ranking sorts on — showing
	// AH's raw description (always the regular price) next to a cheapest-first
	// ordering would make the sort look broken on bonus items.
	const up = effectiveUnitPrice(p);
	return {
		id: p.id,
		name: p.name,
		price: p.currentPrice ?? p.priceBeforeBonus,
		regularPrice: p.priceBeforeBonus,
		isBonus: p.isBonus,
		bonusMechanism: p.bonusMechanism,
		salesUnitSize: p.salesUnitSize,
		unitPrice: up ? `€${up.value.toFixed(2)}/${up.basis}` : null,
		imageUrl: p.imageUrl,
		isPreviouslyBought: p.isPreviouslyBought,
		qty: deriveQuantity(amount, unit, p.salesUnitSize)
	};
}

// AH-INVARIANT: item names are Dutch AH search terms — validate shape/bounds
// only, never trim or normalize them here.
const BodySchema = z.object({
	items: z
		.array(
			z.object({
				name: z.string().min(1).max(256),
				amount: z.string().max(64).nullable().optional(),
				unit: z.string().max(64).nullable().optional(),
				ref: z.string().max(128).optional()
			})
		)
		.optional(),
	full: z.boolean().optional()
});

// Always search a 24-product pool so ranking sees the regular/cheap variants
// (a 5-product fetch hid "AH Penne" behind five specialty pennes). The batch
// preview returns a 10-candidate slice to keep the whole-week payload light;
// a single-item re-search asks for the full pool via `full: true`.
const SEARCH_POOL = 24;
const DEFAULT_CANDIDATES = 10;

/**
 * Search with recipe-name cleanup and one zero-result retry: the stored name
 * ("vers gehakte korianderblaadjes") becomes a product-shaped query
 * ("koriander"), and an empty result gets one more try on the longest word.
 * Returns the query that produced the results — ranking must score against
 * THAT, not the raw recipe name, or every cleaned-up search reads as a
 * zero-coverage synonym match (Codex finding, 2026-07-10).
 * AH-INVARIANT: every candidate query derives from the Dutch item name.
 */
async function searchWithFallback(name: string, size: number): Promise<{ outcome: SearchOutcome; used: string }> {
	const cleaned = toSearchTerm(name);
	const outcome = await searchProducts(cleaned, size);
	if (outcome.ok && !outcome.products.length) {
		const retry = fallbackTerm(cleaned);
		if (retry) {
			const second = await searchProducts(retry, size);
			if (second.ok && second.products.length) return { outcome: second, used: retry };
		}
	}
	return { outcome, used: cleaned };
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	// Fail fast before searching: search is now member-scoped (so isPreviouslyBought
	// is real), and pushes need member tokens anyway.
	const status = getAHStatus();
	if (!status.connected) return json({ ok: false, reason: AH_NOT_CONNECTED });

	const body = await readJsonBody(request, BodySchema);
	const inputs = body.items ?? [];
	if (!inputs.length) return json({ ok: true, items: [] });
	const size = body.full === true ? SEARCH_POOL : DEFAULT_CANDIDATES;

	const favorites = new Map(db.select().from(schema.ahFavorites).all().map((f) => [f.nameKey, f]));

	const items: PreviewItem[] = await Promise.all(
		inputs.map(async (it, i): Promise<PreviewItem> => {
			const term = it.name;
			const amount = it.amount ?? null;
			const unit = it.unit ?? null;
			const ref = it.ref ?? String(i);
			// AH-INVARIANT: the search term is the Dutch shopping-list item name
			// (or a Dutch re-search term the user typed in the modal).
			const { outcome, used } = await searchWithFallback(term, SEARCH_POOL);
			if (!outcome.ok) {
				// Search errored — keep the item, fall back to free text, but say why.
				return { ref, term, amount, unit, status: 'unknown', candidates: [], lowConfidence: false };
			}
			if (!outcome.products.length) {
				return { ref, term, amount, unit, status: 'freetext', candidates: [], lowConfidence: false };
			}
			const { ranked, lowConfidence } = rankProducts(used, outcome.products);
			return {
				ref,
				term,
				amount,
				unit,
				status: 'product',
				candidates: ranked.slice(0, size).map((p) => toPreviewProduct(p, amount, unit)),
				lowConfidence
			};
		})
	);

	// Favorites pin above everything. A favorite missing from its search pool is
	// batch-fetched by id so it still shows (e.g. starred from a re-search term)
	// — and it also rescues a zero-result item from free-text demotion: once a
	// name is pinned to a product, that item never falls back to text.
	const missingFavs: { item: PreviewItem; productId: string }[] = [];
	for (const item of items) {
		if (item.status === 'unknown') continue; // AH search itself is down — don't fetch either
		const fav = favorites.get(normalize(item.term));
		if (!fav) continue;
		const idx = item.candidates.findIndex((c) => c.id === fav.productId);
		if (idx >= 0) {
			const [c] = item.candidates.splice(idx, 1);
			item.candidates.unshift({ ...c, isFavorite: true });
		} else {
			missingFavs.push({ item, productId: fav.productId });
		}
	}
	if (missingFavs.length) {
		const fetched = new Map(
			(await getProductsByIds([...new Set(missingFavs.map((m) => m.productId))])).map((p) => [p.id, p])
		);
		for (const { item, productId } of missingFavs) {
			const p = fetched.get(productId);
			if (!p) continue;
			item.candidates.unshift({ ...toPreviewProduct(p, item.amount, item.unit), isFavorite: true });
			if (item.status === 'freetext') {
				item.status = 'product';
				item.lowConfidence = false;
			}
		}
	}

	// AI archetype pass (batch preview only — re-search is the user actively
	// choosing): re-picks the top candidate where the cheap/textual winner isn't
	// what the ingredient means ("ui" → gele uien, not the cheaper rode).
	// Favorites skip it; any AI failure keeps the deterministic order.
	if (body.full !== true) {
		const adjustable = items.filter(
			(it) => it.status === 'product' && !it.candidates[0]?.isFavorite && it.candidates.length > 1
		);
		const picks = await aiArchetypePicks(adjustable);
		for (const it of adjustable) {
			const idx = picks.get(it.ref);
			if (idx !== undefined && idx > 0 && idx < it.candidates.length) {
				const [c] = it.candidates.splice(idx, 1);
				it.candidates.unshift(c);
			}
		}
	}

	return json({ ok: true, items });
};
