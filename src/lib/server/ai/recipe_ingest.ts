// Shared recipe-from-URL ingestion (Stage 4a / P5.4).
// Extracted verbatim from /api/recipes/scrape/+server.ts so the scrape route AND
// the chat agent's add_recipe_from_url tool share one path: fetch → structured-data
// (JSON-LD) or AI extraction → insert with a review flag on gaps.
// AH-INVARIANT (CLAUDE.md §Critical): ingredient names stay Dutch — never translate
// them here; English display fields are produced lazily by translate_recipe.ts.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { Ingredient } from '$lib/server/db/schema';
import type { Db as DB } from '$lib/server/db/types';
import { checkDailyCap, createMessage, loadPrompt, logSpend, parseModelJson } from '$lib/server/ai/client';
import { getChatModel } from '$lib/server/ai/config';
import { normalizeFoodCategory } from '$lib/food_categories';
import { z } from 'zod';
import { NewIngredientArraySchema } from '$lib/recipe_ingredient';
import { getBackgroundModel } from '$lib/server/ai/config';
import { saveImportedRecipe } from '$lib/server/workflows/import-recipe';

/** Structured recipe extracted from a page, before it is inserted. */
export type ScrapedRecipe = {
	title: string;
	category: string | null;
	servings: number | null;
	totalTimeMin: number | null;
	sourceUrl: string;
	imageUrl: string | null;
	ingredients: Ingredient[];
	directions: string[];
	notes: string | null;
	language: string;
	cuisine: string | null;
	/** Original source lines, kept intact until enrichment validates. */
	rawIngredients: string[];
	structureVersion: 1 | 2;
	structureDraft: Ingredient[] | null;
	ingredientSourceIndexes?: Array<number | null>;
	enrichmentReviewReason: string | null;
};

/** Typed failure so callers map to the right HTTP status / tool error. */
export class RecipeIngestError extends Error {
	constructor(
		message: string,
		readonly code: 'blocked_url' | 'fetch' | 'extract' | 'no_title'
	) {
		super(message);
		this.name = 'RecipeIngestError';
	}
}

function isBlockedIpv4(octets: number[]): boolean {
	const [a, b] = octets;
	if (a === 0) return true; // 0.0.0.0/8 ("this network", incl. 0.0.0.0)
	if (a === 127) return true; // 127.0.0.0/8 loopback
	if (a === 10) return true; // 10.0.0.0/8 RFC1918
	if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 RFC1918
	if (a === 192 && b === 168) return true; // 192.168.0.0/16 RFC1918
	if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + cloud metadata
	return false;
}

/** Expand an IPv6 literal into its 8 hextets. Returns null when unparseable. */
function ipv6Hextets(ip: string): number[] | null {
	let addr = ip;
	const zone = addr.indexOf('%');
	if (zone !== -1) addr = addr.slice(0, zone);
	// Embedded IPv4 tail ("::ffff:127.0.0.1") → fold into two hextets.
	const lastColon = addr.lastIndexOf(':');
	const tail = addr.slice(lastColon + 1);
	if (tail.includes('.')) {
		const oct = tail.split('.').map(Number);
		if (oct.length !== 4 || oct.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return null;
		addr =
			addr.slice(0, lastColon + 1) +
			((oct[0] << 8) | oct[1]).toString(16) +
			':' +
			((oct[2] << 8) | oct[3]).toString(16);
	}
	const parts = addr.split('::');
	if (parts.length > 2) return null;
	const head = parts[0] ? parts[0].split(':') : [];
	const rest = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
	const missing = 8 - head.length - rest.length;
	if (parts.length === 2 && missing < 1 && head.length + rest.length !== 8) return null;
	if (parts.length === 1 && head.length !== 8) return null;
	const groups =
		parts.length === 2 ? [...head, ...Array(Math.max(missing, 0)).fill('0'), ...rest] : head;
	if (groups.length !== 8) return null;
	const nums = groups.map((g) => parseInt(g || '0', 16));
	if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return null;
	return nums;
}

/**
 * SSRF blocklist (F9), pure and unit-testable: true when an IP literal is
 * loopback (127.0.0.0/8, ::1), unspecified (0.0.0.0/8, ::), RFC1918
 * (10/8, 172.16/12, 192.168/16), link-local + cloud metadata (169.254.0.0/16,
 * fe80::/10), or IPv6 unique-local (fc00::/7, which covers fd00::/8).
 * IPv4-mapped IPv6 addresses are checked as their embedded IPv4.
 * Non-IP input fails closed (blocked).
 */
function isBlockedAddress(ip: string): boolean {
	const kind = isIP(ip);
	if (kind === 4) {
		return isBlockedIpv4(ip.split('.').map(Number));
	}
	if (kind === 6) {
		const h = ipv6Hextets(ip);
		if (!h) return true;
		if (h.every((n) => n === 0)) return true; // :: unspecified
		if (h.slice(0, 7).every((n) => n === 0) && h[7] === 1) return true; // ::1 loopback
		if (h.slice(0, 5).every((n) => n === 0) && h[5] === 0xffff) {
			// ::ffff:a.b.c.d IPv4-mapped
			return isBlockedIpv4([h[6] >> 8, h[6] & 0xff, h[7] >> 8, h[7] & 0xff]);
		}
		if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
		if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
		return false;
	}
	return true;
}

const BLOCKED_URL_MESSAGE = 'That URL is not allowed.';

/**
 * SSRF guard (F9): scraping fetches a user-supplied URL from the server, so
 * only http/https is allowed and the host must not be — or resolve to — a
 * private, loopback, link-local, or metadata address. IP-literal hosts are
 * checked directly; hostnames are resolved via DNS and every returned address
 * must be public. Throws RecipeIngestError('blocked_url') on violation.
 */
async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		throw new RecipeIngestError(BLOCKED_URL_MESSAGE, 'blocked_url');
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new RecipeIngestError(BLOCKED_URL_MESSAGE, 'blocked_url');
	}
	// URL.hostname wraps IPv6 literals in brackets.
	const hostname =
		parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
			? parsed.hostname.slice(1, -1)
			: parsed.hostname;
	if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
		throw new RecipeIngestError(BLOCKED_URL_MESSAGE, 'blocked_url');
	}
	if (isIP(hostname) !== 0) {
		if (isBlockedAddress(hostname)) {
			throw new RecipeIngestError(BLOCKED_URL_MESSAGE, 'blocked_url');
		}
		return;
	}
	let addresses: { address: string }[];
	try {
		addresses = await lookup(hostname, { all: true });
	} catch {
		throw new RecipeIngestError('Could not resolve that URL.', 'blocked_url');
	}
	if (!addresses.length || addresses.some((a) => isBlockedAddress(a.address))) {
		throw new RecipeIngestError(BLOCKED_URL_MESSAGE, 'blocked_url');
	}
}

function extractJsonLdRecipe(html: string): object | null {
	const matches = [
		...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
	];
	for (const match of matches) {
		try {
			const data = JSON.parse(match[1]);
			const items = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data];
			const recipe = items.find(
				(item: { '@type': string | string[] }) =>
					item['@type'] === 'Recipe' ||
					(Array.isArray(item['@type']) && item['@type'].includes('Recipe'))
			);
			if (recipe) return recipe;
		} catch {
			// malformed JSON-LD — skip
		}
	}
	return null;
}

function firstScalarText(value: unknown): string | null {
	const candidates = Array.isArray(value) ? value : [value];
	for (const candidate of candidates) {
		if (typeof candidate !== 'string' && typeof candidate !== 'number') continue;
		const text = String(candidate).trim();
		if (text) return text;
	}
	return null;
}

function scalarTextArray(value: unknown): string[] {
	const candidates = Array.isArray(value) ? value : [value];
	return candidates.flatMap((candidate) => {
		const text = firstScalarText(candidate);
		return text ? [text] : [];
	});
}

function instructionTexts(value: unknown): string[] {
	const candidates = Array.isArray(value) ? value : [value];
	return candidates.flatMap((candidate) => {
		const direct = firstScalarText(candidate);
		if (direct) return [direct];
		if (!candidate || typeof candidate !== 'object') return [];
		const instruction = candidate as Record<string, unknown>;
		const text = firstScalarText(instruction.text);
		if (text) return [text];
		return instructionTexts(instruction.itemListElement ?? []);
	});
}

function firstImageUrl(value: unknown): string | null {
	const candidates = Array.isArray(value) ? value : [value];
	for (const candidate of candidates) {
		const direct = firstScalarText(candidate);
		if (direct) return direct;
		if (!candidate || typeof candidate !== 'object') continue;
		const image = candidate as Record<string, unknown>;
		const nested = firstScalarText(image.url) ?? firstScalarText(image.contentUrl);
		if (nested) return nested;
	}
	return null;
}

function firstNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	const text = firstScalarText(value);
	if (!text) return null;
	const match = text.replace(',', '.').match(/\d+(?:\.\d+)?/);
	if (!match) return null;
	const parsed = Number(match[0]);
	return Number.isFinite(parsed) ? parsed : null;
}

function firstInteger(value: unknown): number | null {
	const number = firstNumber(value);
	if (number == null) return null;
	const integer = Math.trunc(number);
	return integer > 0 ? integer : null;
}

function isoToMinutes(iso?: string | null): number | null {
	if (!iso) return null;
	const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
	if (!m) return null;
	return (parseInt(m[1] ?? '0') * 60) + parseInt(m[2] ?? '0');
}

function parseRawIngredient(raw: string): Ingredient {
	const m = raw.match(
		/^([\d.,/½¼¾⅓⅔]+\s*(?:g|kg|ml|l|el|tl|stuks?|stuk|snufje|kopje|beker|zakje|pak|blik|fles)?\s*)/i
	);
	return m
		? { name: raw.slice(m[1].length).trim() || raw, amount: m[1].trim() }
		: { name: raw, amount: '' };
}

const EnrichedIngredientSchema = z.object({
	sourceIndex: z.number().int().nonnegative().nullable(),
	name: z.string().trim().min(1),
	amount: z.string().trim(),
	unit: z.string().trim().min(1).optional(),
	preparation: z.string().trim().min(1).optional(),
	role: z.enum(['cook_in', 'serve_fresh']),
	optional: z.boolean(),
	component: z.string().trim().min(1).optional(),
	purchaseForm: z.enum(['fresh', 'preserved', 'frozen', 'dried', 'any']),
	scale: z.enum(['linear', 'whole', 'fixed']),
	origin: z.enum(['source', 'ai_suggested']),
	substitutes: z.array(z.object({
		name: z.string().trim().min(1),
		kind: z.enum(['protein', 'spice', 'vegetable', 'other']).optional(),
		note: z.string().trim().min(1).max(500).optional()
	})).max(12).optional()
});

const EnrichmentSchema = z.object({
	confidence: z.enum(['high', 'low']),
	ingredients: z.array(EnrichedIngredientSchema).max(100),
	reviewReason: z.string().trim().min(1).max(500).nullable().default(null)
});

export type ValidatedEnrichment = {
	confidence: 'high' | 'low';
	ingredients: Ingredient[];
	sourceIndexes: Array<number | null>;
	reviewReason: string | null;
};

function normalizedRecipeText(value: string): string {
	return value.normalize('NFKD').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const PREPARATION_ACTIONS: Array<[RegExp, string[]]> = [
	[/\b(chopped|chop|gehakt|fijngehakt|hak)\b/u, ['chop', 'hak', 'snijd']],
	[/\b(diced|dice|blokjes|dobbelstenen)\b/u, ['dice', 'snijd', 'blok']],
	[/\b(sliced|slice|gesneden|in plakjes)\b/u, ['slice', 'snijd', 'plak']],
	[/\b(grated|grate|geraspt|rasp)\b/u, ['grate', 'rasp']],
	[/\b(minced|mince|fijngehakt)\b/u, ['mince', 'hak', 'snijd']],
	[/\b(drained|drain|uitgelekt|afgegoten)\b/u, ['drain', 'giet', 'uitgelek']],
	[/\b(peeled|peel|geschild|schil)\b/u, ['peel', 'schil']],
	[/\b(crushed|crush|geplet|geperst)\b/u, ['crush', 'plet', 'pers']],
	[/\b(beaten|beat|losgeklopt)\b/u, ['beat', 'klop']],
	[/\b(cooked|cooked|voorgegaard|gekookt)\b/u, ['cook', 'kook', 'bak']]
];

/** Returns a review reason when imported preparation is not visibly covered by a direction. */
export function preparationCoverageReview(ingredients: Ingredient[], directions: string[]): string | null {
	const directionText = normalizedRecipeText(directions.join(' '));
	for (const ingredient of ingredients) {
		if (!ingredient.preparation) continue;
		const name = normalizedRecipeText(ingredient.name);
		const action = PREPARATION_ACTIONS.find(([pattern]) => pattern.test(normalizedRecipeText(ingredient.preparation!)));
		const actionCovered = action?.[1].some((word) => directionText.includes(word)) ??
			normalizedRecipeText(ingredient.preparation).split(' ').some((word) => word.length > 3 && directionText.includes(word));
		if (!directionText.includes(name) || !actionCovered) {
			return `Preparation for “${ingredient.name}” needs a cooking step: ${ingredient.preparation}.`;
		}
	}
	return null;
}

/** Deterministic writer gate: every source line appears exactly once. */
export function validateRecipeEnrichment(raw: unknown, sourceCount: number): ValidatedEnrichment {
	const parsed = EnrichmentSchema.parse(raw);
	const sourceIndexes = parsed.ingredients
		.filter((ingredient) => ingredient.origin === 'source')
		.map((ingredient) => ingredient.sourceIndex);
	const expected = Array.from({ length: sourceCount }, (_, index) => index);
	const actual = sourceIndexes.filter((index): index is number => index != null).sort((a, b) => a - b);
	if (sourceIndexes.some((index) => index == null) || actual.length !== expected.length || actual.some((index, i) => index !== expected[i])) {
		throw new Error('Enrichment must preserve every source ingredient exactly once');
	}
	for (const ingredient of parsed.ingredients) {
		if (ingredient.sourceIndex != null && ingredient.sourceIndex >= sourceCount) {
			throw new Error('Enrichment references an unknown source ingredient');
		}
		if (ingredient.origin === 'ai_suggested' && (ingredient.optional !== true || ingredient.sourceIndex !== null)) {
			throw new Error('AI suggestions must be optional and must not claim a source line');
		}
		if (ingredient.origin === 'source' && ingredient.sourceIndex === null) {
			throw new Error('Source ingredients must reference their source line');
		}
	}

	const ingredients = NewIngredientArraySchema.parse(
		parsed.ingredients.map(({ sourceIndex: _sourceIndex, ...ingredient }) => ingredient)
	);
	return {
		confidence: parsed.confidence,
		ingredients,
		sourceIndexes: parsed.ingredients.map((ingredient) => ingredient.sourceIndex),
		reviewReason: parsed.reviewReason
	};
}

export async function enrichRecipeStructure(data: ScrapedRecipe): Promise<ScrapedRecipe> {
	if (data.rawIngredients.length === 0) {
		return { ...data, enrichmentReviewReason: 'Imported without ingredients; structure could not be improved.' };
	}
	if (checkDailyCap('background').exceeded) {
		return { ...data, enrichmentReviewReason: 'Background AI spend cap reached; improve this recipe later.' };
	}
	try {
		const msg = await createMessage({
			model: getBackgroundModel().value,
			system: loadPrompt('recipe_enrich'),
			messages: [{
				role: 'user',
				content: JSON.stringify({
					title: data.title,
					language: data.language,
					rawIngredients: data.rawIngredients,
					directions: data.directions
				})
			}]
		});
		logSpend(msg.model, msg.usage, msg.costUsd);
		const enriched = validateRecipeEnrichment(parseModelJson(msg.text), data.rawIngredients.length);
		const preparationReviewReason = preparationCoverageReview(enriched.ingredients, data.directions);
		if (enriched.confidence === 'low') {
			return {
				...data,
				structureDraft: enriched.ingredients,
				ingredientSourceIndexes: enriched.sourceIndexes,
				structureVersion: 1,
				enrichmentReviewReason: enriched.reviewReason ?? preparationReviewReason ?? 'Check the proposed ingredient structure before applying it.'
			};
		}
		return {
			...data,
			ingredients: enriched.ingredients,
			ingredientSourceIndexes: enriched.sourceIndexes,
			structureDraft: null,
			structureVersion: 2,
			enrichmentReviewReason: preparationReviewReason
		};
	} catch (error) {
		return {
			...data,
			structureVersion: 1,
			structureDraft: null,
			enrichmentReviewReason: `Ingredient structure needs review: ${error instanceof Error ? error.message : 'invalid enrichment'}`
		};
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJsonLd(ld: any, url: string): ScrapedRecipe {
	const rawIngredients = scalarTextArray(ld.recipeIngredient ?? []);
	const ingredients: Ingredient[] = rawIngredients.map(parseRawIngredient);
	const directions = instructionTexts(ld.recipeInstructions ?? []);

	return {
		title: firstScalarText(ld.name) ?? '',
		category: normalizeFoodCategory(firstScalarText(ld.recipeCategory)),
		servings: firstInteger(ld.recipeYield),
		totalTimeMin: isoToMinutes(firstScalarText(ld.totalTime) ?? firstScalarText(ld.cookTime)),
		sourceUrl: url,
		imageUrl: firstImageUrl(ld.image),
		ingredients,
		directions,
		notes: null as string | null,
		language: 'nl',
		cuisine: firstScalarText(ld.recipeCuisine),
		rawIngredients,
		structureVersion: 1,
		structureDraft: null,
		enrichmentReviewReason: null
	};
}

async function scrapeWithClaude(url: string, html: string): Promise<ScrapedRecipe> {
	const prompt = loadPrompt('recipe_scrape');
	const body = html
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.slice(0, 80000);

	const msg = await createMessage({
		model: getChatModel().value,
		system: prompt,
		messages: [{ role: 'user', content: `source_url: ${url}\n\nhtml:\n${body}` }]
	});

	logSpend(msg.model, msg.usage, msg.costUsd);

	const text = msg.text;
	// Fence-tolerant parse: GLM occasionally wraps the object in a ```json fence
	// despite the prompt banning it — a raw JSON.parse would 500 the import.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const raw = parseModelJson(text) as any;

	const rawIngredients = scalarTextArray(raw.ingredients_raw ?? []);
	const ingredients: Ingredient[] = rawIngredients.map(parseRawIngredient);
	return {
		title: firstScalarText(raw.aliases) ?? firstScalarText(raw.title) ?? '',
		category: normalizeFoodCategory(firstScalarText(raw.recipe_category)),
		servings: firstInteger(raw.servings),
		totalTimeMin: firstInteger(raw.total_time_min),
		sourceUrl: url,
		imageUrl: null as string | null,
		ingredients,
		directions: scalarTextArray(raw.directions ?? []),
		notes: firstScalarText(raw.notes),
		language: firstScalarText(raw.language) ?? 'nl',
		cuisine: firstScalarText(raw.cuisine),
		rawIngredients,
		structureVersion: 1,
		structureDraft: null,
		enrichmentReviewReason: null
	};
}

/**
 * Fetch a recipe URL and extract it into structured data. Prefers the page's
 * JSON-LD Recipe block (high confidence); falls back to AI extraction of the
 * stripped HTML body. Throws RecipeIngestError on network / extraction / no-title.
 */
export async function scrapeRecipeFromUrl(
	url: string,
	fetchFn: typeof fetch = fetch
): Promise<ScrapedRecipe> {
	await assertPublicHttpUrl(url);

	let html: string;
	try {
		const res = await fetchFn(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; HouseholdBrain/2.0)',
				Accept: 'text/html,application/xhtml+xml',
				'Accept-Language': 'nl-NL,nl;q=0.9'
			},
			signal: AbortSignal.timeout(12000)
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		html = await res.text();
	} catch (err) {
		// Log the detail server-side; the client gets a generic message so fetch
		// errors can't serve as a blind SSRF oracle (F9).
		console.error(
			`[recipe_ingest] fetch failed for ${url}: ${err instanceof Error ? err.message : err}`
		);
		throw new RecipeIngestError('Could not fetch that URL', 'fetch');
	}

	let recipeData: ScrapedRecipe;
	const ld = extractJsonLdRecipe(html);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if (ld && (ld as any).recipeIngredient?.length > 0) {
		recipeData = parseJsonLd(ld, url);
	} else {
		try {
			recipeData = await scrapeWithClaude(url, html);
		} catch (err) {
			throw new RecipeIngestError(
				`Extraction failed: ${err instanceof Error ? err.message : 'AI error'}`,
				'extract'
			);
		}
	}

	if (!recipeData.title) throw new RecipeIngestError('No recipe title found', 'no_title');
	return enrichRecipeStructure(recipeData);
}

/**
 * Map a review reason (or null = clean) to the recipe's (needsReview, reviewReason)
 * column pair. The single place that encodes the invariant "reviewReason is set iff
 * needsReview"; every recipe write funnels its reason through here (add_recipe,
 * edit_recipe, insertScrapedRecipe) so the pairing can't drift.
 */
/** Insert an extracted recipe with a unique slug + review flag. Shared by route + tool. */
export function insertScrapedRecipe(
	db: DB,
	data: ScrapedRecipe
): { slug: string; title: string; needsReview: boolean; reviewReason: string | null } {
	return saveImportedRecipe(db, data);
}
