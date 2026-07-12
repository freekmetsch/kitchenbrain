// Facet taxonomy (ADR 0001): Kind + Food Class + canonical units.
// Food Class is stored at its most specific known value; filters roll up
// via the parent map. Extends the food_categories.ts normalizer (its alias
// map keeps handling the four legacy core classes); does not fork it.
import { normalizeFoodCategory } from '$lib/food_categories';

export const KINDS = ['ingredient', 'leftover', 'processed'] as const;
export type Kind = (typeof KINDS)[number];

export function isKind(value: string | null | undefined): value is Kind {
	return !!value && (KINDS as readonly string[]).includes(value);
}

// specific -> parent; classes without an entry are roots.
const FOOD_CLASS_PARENT: Readonly<Record<string, string>> = {
	chicken: 'meat',
	beef: 'meat',
	pork: 'meat',
	lamb: 'meat',
	vegan: 'vegetarian'
};

export const FOOD_CLASS_ROOTS = ['meat', 'fish', 'vegetarian', 'other'] as const;

const KNOWN_FOOD_CLASSES = new Set<string>([...FOOD_CLASS_ROOTS, ...Object.keys(FOOD_CLASS_PARENT)]);

// Dutch/free-form aliases for specific classes; core-class aliases
// (vlees -> meat, vis -> fish, ...) stay in food_categories.ts.
const FOOD_CLASS_ALIASES = new Map<string, string>([
	['kip', 'chicken'],
	['kippen', 'chicken'],
	['rund', 'beef'],
	['rundvlees', 'beef'],
	['varken', 'pork'],
	['varkensvlees', 'pork'],
	['lam', 'lamb'],
	['lamsvlees', 'lamb']
]);

function isKnownFoodClass(value: string): boolean {
	return KNOWN_FOOD_CLASSES.has(value);
}

/**
 * Normalize free-form input to a known food-class slug, or null when the
 * value can't be mapped deterministically (callers flag those for review).
 */
export function normalizeFoodClass(value: string | null | undefined): string | null {
	const cleaned = value?.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ') ?? '';
	if (!cleaned) return null;
	const aliased = FOOD_CLASS_ALIASES.get(cleaned) ?? normalizeFoodCategory(cleaned) ?? cleaned;
	return isKnownFoodClass(aliased) ? aliased : null;
}

// Name-based inference (P3.2 guardian). Tokens are ONLY the already-known
// vocabulary: FOOD_CLASS_ALIASES keys, the core-class aliases food_categories
// resolves, and the class slugs themselves. Ambiguous food knowledge is the
// AI guardian's job (Phase 3.1) — do not grow this into a food dictionary.
const INFERENCE_TOKENS: ReadonlyArray<readonly [string, string]> = (() => {
	const tokens = new Map<string, string>(FOOD_CLASS_ALIASES);
	// Core-class aliases already handled by food_categories.ts (vlees -> meat, ...).
	for (const alias of [
		'vlees',
		'vis',
		'seafood',
		'vegetarisch',
		'veganistisch',
		'vegetable',
		'vegetables',
		'veggie',
		'vega',
		'plant based',
		'plant-based'
	]) {
		const slug = normalizeFoodClass(alias);
		if (slug) tokens.set(alias, slug);
	}
	// The known class slugs themselves; 'other' is excluded — it substring-hits
	// ordinary words and inferring it adds no shelf information.
	for (const slug of KNOWN_FOOD_CLASSES) {
		if (slug !== 'other') tokens.set(slug, slug);
	}
	// Longest token first so "rundvlees" wins over "rund"/"vlees" and "vegan"
	// over "vega".
	return [...tokens.entries()].sort((a, b) => b[0].length - a[0].length);
})();

/**
 * Conservatively infer a food class from an item name: substring match on the
 * lowercased name against known tokens only ("kipfilet" -> chicken,
 * "rundergehakt" -> beef). Returns null when no known token appears — those
 * items stay in the review queue for the AI pass.
 */
export function inferFoodClassFromName(name: string): string | null {
	const lowered = name.trim().toLowerCase();
	if (!lowered) return null;
	// Match per word: a name-word equals the token or starts with it (Dutch
	// compounds put the class word first — "kipfilet", "rundergehakt"). This
	// rejects mid-word coincidences a raw substring would catch ("vlammetjes"
	// !-> lamb). Multi-word tokens ("plant based") fall back to a full-name scan.
	const words = lowered.split(/[^a-zà-ÿ]+/).filter(Boolean);
	for (const [token, slug] of INFERENCE_TOKENS) {
		if (token.includes(' ')) {
			if (lowered.includes(token)) return slug;
		} else if (words.some((w) => w === token || w.startsWith(token))) {
			return slug;
		}
	}
	return null;
}

/**
 * Unclassified per the taxonomy audit (scripts/audit_taxonomy.ts): kind is
 * missing, or an ingredient/leftover lacks a food class. Processed items
 * carry no food-class requirement.
 */
export function isUnclassified(kind: string | null, foodClass: string | null): boolean {
	if (kind == null) return true;
	return (kind === 'ingredient' || kind === 'leftover') && foodClass == null;
}

/** Does `specific` equal `target` or roll up to it via the parent chain? */
export function rollsUpTo(specific: string | null | undefined, target: string): boolean {
	let current = specific ?? null;
	while (current) {
		if (current === target) return true;
		current = FOOD_CLASS_PARENT[current] ?? null;
	}
	return false;
}

// Canonical unit set (G2): leftovers count in portions, everything else in
// its natural unit. Enforced at the mutation boundary — alias-known units
// normalize; anything else is kept but flagged Needs Review.
const CANONICAL_UNITS = [
	'g',
	'kg',
	'ml',
	'l',
	'stuk',
	'pak',
	'blik',
	'zak',
	'bak',
	'portion'
] as const;

const CANONICAL_UNIT_SET = new Set<string>(CANONICAL_UNITS);

const UNIT_ALIASES = new Map([
	['gram', 'g'],
	['grams', 'g'],
	['gr', 'g'],
	['g', 'g'],
	['kilogram', 'kg'],
	['kilo', 'kg'],
	['kg', 'kg'],
	['milliliter', 'ml'],
	['millilitre', 'ml'],
	['ml', 'ml'],
	['liter', 'l'],
	['litre', 'l'],
	['l', 'l'],
	['stuk', 'stuk'],
	['stuks', 'stuk'],
	['pieces', 'stuk'],
	['piece', 'stuk'],
	['pcs', 'stuk'],
	['pak', 'pak'],
	['pakken', 'pak'],
	['blik', 'blik'],
	['blikken', 'blik'],
	['zak', 'zak'],
	['zakken', 'zak'],
	['bak', 'bak'],
	['bakken', 'bak'],
	['portion', 'portion'],
	['portions', 'portion'],
	['portie', 'portion'],
	['porties', 'portion']
]);

export function normalizeUnit(unit: string | null | undefined): string {
	const cleaned = unit?.trim().toLowerCase() ?? '';
	return UNIT_ALIASES.get(cleaned) ?? cleaned;
}

export function isCanonicalUnit(unit: string | null | undefined): boolean {
	return !unit || CANONICAL_UNIT_SET.has(normalizeUnit(unit));
}
