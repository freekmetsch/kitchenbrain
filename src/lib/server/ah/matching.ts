// Re-ranking + quantity heuristics for AH product matching (Phase 2).
//
// AH search already resolves Dutch synonyms/compounds (verified live 2026-07-07:
// the query "snoeptomaatjes" returns cherry-tomato products). So this module
// NEVER filters AH's results — it only re-ranks WITHIN them, flags a
// low-confidence top pick, and derives a sane pack quantity from the needed
// amount. The old containment filter's two bugs (rejecting valid synonym
// matches, and taking the first containment hit instead of the best) are both
// answered by "trust AH's recall, re-rank for the right/cheap product."
//
// The 2026-07-10 sweep (real-preview failures: a shower gel topping "zonnebloem-
// of koolzaadolie", a cookie topping "suiker") added three rules on top:
// Dutch head-final compound matching, "zonder X" negation, and non-food
// category demotion — plus a key-based sort, because the old pairwise
// comparator was not a total order (cross-basis price edges created cycles,
// so Array.sort output depended on input order).

import type { AHProduct } from './client';

// --- Text normalization --------------------------------------------------

const DIACRITICS = /[̀-ͯ]/g;

/** Lowercase + strip diacritics so "café" ~ "cafe". */
export function normalize(s: string): string {
	return s.normalize('NFD').replace(DIACRITICS, '').toLowerCase().trim();
}

/**
 * Very light Dutch stem: drop a single trailing plural/diminutive ending so
 * near-misses like "wortels" ~ "wortel" line up. Deliberately shallow — AH
 * already did the hard synonym resolution, so an imperfect stem only softens
 * the confidence signal, it never costs a match (results are never dropped).
 */
function stem(tok: string): string {
	for (const suf of ['tjes', 'tje', 'jes', 'je', 'en', 's']) {
		// ≥ 2 chars must remain: "uien" → "ui" (the paste's pie-over-onions bug
		// traced here — a stricter guard left the plural unstemmed, so "AH Gele
		// uien" shared no token with the term "ui").
		if (tok.length >= suf.length + 2 && tok.endsWith(suf)) return tok.slice(0, -suf.length);
	}
	return tok;
}

function stemmedTokens(s: string): Set<string> {
	return new Set(
		normalize(s)
			.split(/[^a-z0-9]+/)
			.filter(Boolean)
			.map(stem)
	);
}

// --- Token scoring (Dutch compounds + negation) ---------------------------

/**
 * "zonder suikers" / "0% toegevoegde suikers" / "geen zout" mean the product
 * is defined by NOT containing the ingredient — the mentioned word must not
 * count as a match ("Cookie zonder suikers" is not a sugar product).
 */
const NEGATION = /(?:zonder|geen|0%)\s+(?:toegevoegde?\s+)?([a-z0-9]+)/g;

function productTokens(name: string): Set<string> {
	const norm = normalize(name);
	const negated = new Set<string>();
	for (const m of norm.matchAll(NEGATION)) negated.add(stem(m[1]));
	const toks = stemmedTokens(norm);
	for (const n of negated) toks.delete(n);
	return toks;
}

/** A compound part matches when some product token equals, starts, or ends with it. */
function partMatch(part: string, pToks: Set<string>): boolean {
	for (const t of pToks) if (t === part || t.startsWith(part) || t.endsWith(part)) return true;
	return false;
}

/**
 * Score one term token against a product's tokens:
 *  1.0  exact ("zout" in "Himalaya zout"),
 *  1.0  product compound ends with the term — Dutch compounds are head-final,
 *       so "tafelzout"/"zeezout" ARE zout, "kristalsuiker" IS suiker,
 *  1.0  the term is itself a compound whose parts all appear as product words
 *       ("groentebouillon" → "AH Bouillon groente"),
 *  0.75 partial compound relation: only the term's head appears
 *       ("groentebouillon" → "runderbouillon"), or the term is the modifier of
 *       a product compound ("zonnebloem" → "zonnebloemolie"; min 4 chars so
 *       "ui" never claims every ui- word),
 *  0    no relation.
 */
function tokenScore(termTok: string, pToks: Set<string>): number {
	if (pToks.has(termTok)) return 1;
	for (const t of pToks) if (t.length > termTok.length && t.endsWith(termTok)) return 1;
	if (termTok.length >= 8) {
		for (let i = 4; i <= termTok.length - 4; i++) {
			if (partMatch(termTok.slice(0, i), pToks) && partMatch(termTok.slice(i), pToks)) return 1;
		}
	}
	for (const t of pToks) if (t.length >= 4 && termTok.length > t.length && termTok.endsWith(t)) return 0.75;
	if (termTok.length >= 4) {
		for (const t of pToks) if (t.length > termTok.length && t.startsWith(termTok)) return 0.75;
	}
	return 0;
}

function coverage(termTokens: Set<string>, pToks: Set<string>): number {
	if (!termTokens.size) return 0;
	let sum = 0;
	for (const tok of termTokens) sum += tokenScore(tok, pToks);
	return sum / termTokens.size;
}

// --- Search-term cleanup (recipe names → product-shaped queries) ----------

/**
 * Prep words that pollute AH recall ("vers gehakte korianderblaadjes" returns
 * nothing; "koriander" returns the fresh herb). Deliberately excludes words
 * that name a DIFFERENT product: "gemalen" (ground vs fresh spice) and
 * "gedroogde" (dried vs fresh) stay in the query.
 */
const PREP_WORDS = new Set([
	'vers',
	'verse',
	'gehakt',
	'gehakte',
	'fijngehakt',
	'fijngehakte',
	'gesneden',
	'fijngesneden',
	'gewassen',
	'geraspt',
	'geraspte',
	'grote',
	'kleine',
	'middelgrote'
]);

/**
 * Turn a recipe-flavoured ingredient name into a product-shaped AH query.
 * Dutch in, Dutch out (AH-INVARIANT). Three rewrites, all conservative:
 *  - "zonnebloem- of koolzaadolie" (either/or) → the complete alternative
 *    ("koolzaadolie"); "A of B" with both complete → the first.
 *  - prep words drop, except in last position ("gehakte koriander" →
 *    "koriander", but "half-om-half gehakt" keeps its noun).
 *  - leaf-form compound tails cut: "korianderblaadjes" → "koriander".
 * Falls back to the input whenever a rewrite would leave nothing.
 */
export function toSearchTerm(name: string): string {
	let s = name.trim();
	const dangling = s.match(/^(.+?)-\s*of\s+(.+)$/i);
	if (dangling) s = dangling[2].trim();
	else {
		const either = s.match(/^(.+?)\s+of\s+(.+)$/i);
		if (either) s = either[1].trim();
	}

	const words = s.split(/\s+/);
	const kept = words.filter((w, i) => i === words.length - 1 || !PREP_WORDS.has(normalize(w)));
	const cleaned = kept
		.map((w) => {
			const n = normalize(w);
			for (const tail of ['blaadjes', 'blaadje', 'takjes', 'takje']) {
				if (n !== tail && n.endsWith(tail)) return w.slice(0, w.length - tail.length);
			}
			return w;
		})
		.filter((w) => {
			const n = normalize(w);
			return n !== 'blaadjes' && n !== 'blaadje' && n !== 'takjes' && n !== 'takje';
		})
		// A last-position prep word survived the position guard only to matter
		// when it's NOT alone; solo it means the query lost its noun.
		.filter((w, _i, arr) => arr.length > 1 || !PREP_WORDS.has(normalize(w)) || w === name.trim());

	const result = cleaned.join(' ').trim();
	return result || name.trim();
}

/** Zero-result fallback: retry with just the longest word ("verse koriander los" → "koriander"). */
export function fallbackTerm(term: string): string | null {
	const words = term.split(/\s+/).filter(Boolean);
	if (words.length < 2) return null;
	const longest = words.reduce((a, b) => (b.length > a.length ? b : a));
	return longest === term ? null : longest;
}

// --- Unit price (for the cheapest-per-unit tie-break) --------------------

type UnitPrice = { value: number; basis: string };

/**
 * Parse an AH unitPriceDescription ("prijs per kg €3.50" / "normale prijs per
 * kg €3.50") into a comparable {value, basis}. Only same-basis values are ever
 * compared, so a kg price and a stuk price never cross-rank.
 */
function parseUnitPrice(desc: string | null): UnitPrice | null {
	if (!desc) return null;
	const price = desc.match(/€\s*(\d+(?:[.,]\d+)?)/);
	const basis = desc.match(/per\s+([a-zà-ÿ]+)/i);
	if (!price || !basis) return null;
	const value = Number(price[1].replace(',', '.'));
	if (!Number.isFinite(value)) return null;
	let b = normalize(basis[1]);
	if (b === 'liter') b = 'l';
	if (b === 'stuks') b = 'stuk';
	return { value, basis: b };
}

/**
 * Unit price at what the household would actually pay. On bonus items AH's
 * unitPriceDescription still carries the REGULAR unit price ("normale prijs
 * per kg ...", verified live 2026-07-08), so scale it by the bonus ratio
 * (currentPrice / priceBeforeBonus) when both prices are present.
 */
export function effectiveUnitPrice(p: AHProduct): UnitPrice | null {
	const up = parseUnitPrice(p.unitPriceDescription);
	if (!up) return null;
	if (p.isBonus && p.currentPrice != null && p.priceBeforeBonus != null && p.priceBeforeBonus > 0) {
		return { value: up.value * (p.currentPrice / p.priceBeforeBonus), basis: up.basis };
	}
	return up;
}

// --- Quantity derivation (F13: amounts reach AH) -------------------------

const UNIT_ALIASES: Record<string, { dim: 'mass' | 'vol' | 'count'; toBase: number }> = {
	g: { dim: 'mass', toBase: 1 },
	gram: { dim: 'mass', toBase: 1 },
	kg: { dim: 'mass', toBase: 1000 },
	ml: { dim: 'vol', toBase: 1 },
	l: { dim: 'vol', toBase: 1000 },
	liter: { dim: 'vol', toBase: 1000 },
	stuk: { dim: 'count', toBase: 1 },
	stuks: { dim: 'count', toBase: 1 }
};

function parseAmountUnit(amount: string | null, unit: string | null): { qty: number; u: string } | null {
	if (!amount) return null;
	const rawAmount = String(amount).trim();
	const combined = unit ? null : rawAmount.match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-Zà-ÿ]+)$/);
	const amountText = combined ? combined[1] : rawAmount;
	const unitText = combined ? combined[2] : unit;
	const n = Number(amountText.replace(',', '.'));
	if (!Number.isFinite(n) || n <= 0) return null;
	const u = unitText ? normalize(unitText) : '';
	if (!(u in UNIT_ALIASES)) return null;
	return { qty: n, u };
}

/**
 * Parse a plain AH salesUnitSize ("500 g", "1 l", "6 stuks"). Anything that
 * isn't a bare "<number> <unit>" — multipacks ("2 x 250 g"), approximate
 * weights ("ca. 500 g"), "per stuk" — returns null so the caller falls back to
 * quantity 1 (conservative, per the Codex refinement).
 */
function parsePackSize(size: string | null): { qty: number; u: string } | null {
	if (!size) return null;
	const m = normalize(size).match(/^(\d+(?:[.,]\d+)?)\s*([a-z]+)$/);
	if (!m) return null;
	const u = m[2];
	if (!(u in UNIT_ALIASES)) return null;
	return { qty: Number(m[1].replace(',', '.')), u };
}

/**
 * How many packs to order to cover the needed amount. Conservative: only when
 * both the need and the pack size parse to the same physical dimension;
 * otherwise 1. Never returns less than 1.
 */
export function deriveQuantity(
	amount: string | null,
	unit: string | null,
	salesUnitSize: string | null
): number {
	const need = parseAmountUnit(amount, unit);
	const pack = parsePackSize(salesUnitSize);
	if (!need || !pack) return 1;
	const na = UNIT_ALIASES[need.u];
	const pa = UNIT_ALIASES[pack.u];
	if (na.dim !== pa.dim) return 1;
	const packBase = pack.qty * pa.toBase;
	if (packBase <= 0) return 1;
	return Math.max(1, Math.ceil((need.qty * na.toBase) / packBase));
}

// --- Ranking -------------------------------------------------------------

/**
 * Food searches must never surface a Drogisterij hit above food ("Melkmeisje
 * Zonnebloem bad & douche" topped "zonnebloem- of koolzaadolie" in the wild).
 * Values verified live 2026-07-10 against /product/search/v2 mainCategory.
 */
const NONFOOD_CATEGORIES = new Set(['drogisterij', 'huishouden', 'baby en kind', 'huisdier']);

/**
 * Re-rank AH's already-relevant results for "the right, cheap product":
 *   1. food before non-food categories, then
 *   2. textual coverage (compound-aware — guards against an off-topic result
 *      out-ranking a real match), then
 *   3. cheapest effective per-unit price on the pool's majority basis
 *      (Decision 2 as revised 2026-07-10: the household always wants the
 *      cheapest version, so price outranks purchase history), then
 *   4. previously-bought, then
 *   5. AH's own result order.
 * Implemented as a per-product sort KEY (not a pairwise comparator): the old
 * comparator compared prices only within a shared basis, which is not a total
 * order — cycles made the output depend on AH's input order.
 * Never drops a result. `lowConfidence` is true when even the best result
 * shares no word with the term (AH resolved a pure synonym) — the UI flags it.
 */
export function rankProducts(
	term: string,
	products: AHProduct[]
): { ranked: AHProduct[]; lowConfidence: boolean } {
	const termTokens = stemmedTokens(term); // tokenize the invariant term once, not per product
	const scored = products.map((p, i) => ({
		p,
		i,
		score: coverage(termTokens, productTokens(p.name)),
		up: effectiveUnitPrice(p),
		nonfood: p.mainCategory != null && NONFOOD_CATEGORIES.has(normalize(p.mainCategory))
	}));

	// Majority unit-price basis of the pool: price ranks only on that basis so a
	// per-stuk pie never "wins" against per-kg onions on incomparable numbers.
	const basisCounts = new Map<string, number>();
	for (const s of scored) if (s.up) basisCounts.set(s.up.basis, (basisCounts.get(s.up.basis) ?? 0) + 1);
	let majorityBasis: string | null = null;
	let bestCount = 0;
	for (const [basis, count] of [...basisCounts.entries()].sort()) {
		if (count > bestCount) {
			majorityBasis = basis;
			bestCount = count;
		}
	}

	const key = (s: (typeof scored)[number]): [number, number, number, number, number] => [
		s.nonfood ? 1 : 0,
		-s.score,
		s.up && s.up.basis === majorityBasis ? s.up.value : Infinity,
		s.p.isPreviouslyBought ? 0 : 1,
		s.i
	];
	scored.sort((a, b) => {
		const ka = key(a);
		const kb = key(b);
		for (let j = 0; j < ka.length; j++) if (ka[j] !== kb[j]) return ka[j] - kb[j];
		return 0;
	});
	return { ranked: scored.map((s) => s.p), lowConfidence: scored.length > 0 && scored[0].score === 0 };
}
