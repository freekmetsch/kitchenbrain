// AI archetype re-pick for the AH preview (2026-07-10). Deterministic ranking
// gets the pool into shape (compound matching, price, category); this layer
// answers the question ranking can't: which candidate the ingredient MEANS.
// "ui" is gele uien even when rode uien are cheaper per kg; "spinazie" is the
// plain bag, not à la crème. One batched flash call per preview; any failure
// (cap, timeout, bad JSON) degrades to the deterministic order.

import { readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { createMessage, checkDailyCap, logSpend, parseModelJson } from '$lib/server/ai/client';
import { getBackgroundModel } from '$lib/server/ai/config';
import type { PreviewItem } from '$lib/shopping_ah';

const CANDIDATES_SHOWN = 8;
const AI_TIMEOUT_MS = 12_000;

const PicksSchema = z.object({
	picks: z.array(z.object({ ref: z.string(), index: z.number().int().min(0) }))
});

let pickPrompt: string | null = null;

function loadPickPrompt(): string {
	if (!pickPrompt) {
		pickPrompt = readFileSync(join(process.cwd(), 'src/lib/server/ai/prompts/ah_pick.md'), 'utf-8');
	}
	return pickPrompt;
}

/**
 * One batched call over all product-status items without a pinned favorite.
 * Returns ref → chosen candidate index (bounded to what the model saw).
 * Empty map on any failure — callers keep the deterministic order.
 */
export async function aiArchetypePicks(items: PreviewItem[]): Promise<Map<string, number>> {
	const picks = new Map<string, number>();
	if (!items.length) return picks;
	if (checkDailyCap('background').exceeded) return picks;

	const payload = items.map((it) => ({
		ref: it.ref,
		term: it.term,
		amount: [it.amount, it.unit].filter(Boolean).join(' ') || null,
		candidates: it.candidates.slice(0, CANDIDATES_SHOWN).map((c, i) => ({
			i,
			name: c.name,
			size: c.salesUnitSize,
			price: c.price,
			unitPrice: c.unitPrice,
			bought: c.isPreviouslyBought
		}))
	}));

	try {
		// Hard timeout: this pass is optional polish — a stalled provider must
		// never hang the preview. A late completion is simply dropped (its spend
		// goes unlogged; acceptable for a flash-tier call).
		const call = createMessage({
			model: getBackgroundModel().value,
			system: loadPickPrompt(),
			messages: [{ role: 'user', content: JSON.stringify(payload) }]
		});
		call.catch(() => {}); // a post-timeout rejection must not surface as unhandled
		const msg = await Promise.race([
			call,
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('archetype pick timed out')), AI_TIMEOUT_MS)
			)
		]);
		logSpend(msg.model, msg.usage, msg.costUsd);
		const parsed = PicksSchema.parse(parseModelJson(msg.text));
		const byRef = new Map(payload.map((p) => [p.ref, p.candidates.length]));
		for (const p of parsed.picks) {
			const n = byRef.get(p.ref);
			if (n !== undefined && p.index < n) picks.set(p.ref, p.index);
		}
	} catch (err) {
		console.error('[ah_pick] archetype pick failed, keeping deterministic order', err);
	}
	return picks;
}
