// Shared recipe-from-URL ingestion (Stage 4a / P5.4).
// Extracted verbatim from /api/recipes/scrape/+server.ts so the scrape route AND
// the chat agent's add_recipe_from_url tool share one path: fetch → structured-data
// (JSON-LD) or AI extraction → insert with a review flag on gaps.
// AH-INVARIANT (CLAUDE.md §Critical): ingredient names stay Dutch — never translate
// them here; English display fields are produced lazily by translate_recipe.ts.
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import * as schema from '$lib/server/db/schema';
import type { Ingredient } from '$lib/server/db/schema';
import { checkDailyCap, createMessage, loadPrompt, logSpend, parseModelJson } from '$lib/server/ai/client';
import { getChatModel } from '$lib/server/ai/config';
import { kickTranslateOnImport } from '$lib/server/ai/translate_recipe';
import { getAutoTranslateOnImport } from '$lib/server/recipes/prefs';
import { normalizeFoodCategory } from '$lib/food_categories';
import { z } from 'zod';
import { NewIngredientArraySchema } from '$lib/recipe_ingredient';
import { getBackgroundModel } from '$lib/server/ai/config';

type DB = BetterSQLite3Database<typeof schema>;

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

export function slugify(title: string): string {
	return title
		.toLowerCase()
		.replace(/[àáâãäå]/g, 'a')
		.replace(/[èéêë]/g, 'e')
		.replace(/[ìíîï]/g, 'i')
		.replace(/[òóôõö]/g, 'o')
		.replace(/[ùúûü]/g, 'u')
		.replace(/[ñ]/g, 'n')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
}

export function uniqueSlug(db: DB, base: string): string {
	let slug = base;
	let n = 1;
	while (db.select({ id: schema.recipes.id }).from(schema.recipes).where(eq(schema.recipes.slug, slug)).get()) {
		slug = `${base}-${n++}`;
	}
	return slug;
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

function isoToMinutes(iso?: string): number | null {
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
		if (enriched.confidence === 'low') {
			return {
				...data,
				structureDraft: enriched.ingredients,
				ingredientSourceIndexes: enriched.sourceIndexes,
				structureVersion: 1,
				enrichmentReviewReason: enriched.reviewReason ?? 'Check the proposed ingredient structure before applying it.'
			};
		}
		return {
			...data,
			ingredients: enriched.ingredients,
			ingredientSourceIndexes: enriched.sourceIndexes,
			structureDraft: null,
			structureVersion: 2,
			enrichmentReviewReason: null
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
	const rawIngredients: string[] = (ld.recipeIngredient ?? []).map(String);
	const ingredients: Ingredient[] = rawIngredients.map(parseRawIngredient);
	const directions: string[] = (ld.recipeInstructions ?? [])
		.map((s: string | { text?: string }) => (typeof s === 'string' ? s : (s.text ?? '')))
		.filter(Boolean);

	return {
		title: (ld.name ?? '') as string,
		category: normalizeFoodCategory((ld.recipeCategory ?? null) as string | null),
		servings: parseInt(ld.recipeYield) || null,
		totalTimeMin: isoToMinutes(ld.totalTime ?? ld.cookTime),
		sourceUrl: url,
		imageUrl:
			typeof ld.image === 'string'
				? ld.image
				: ((ld.image?.url ?? ld.image?.[0] ?? null) as string | null),
		ingredients,
		directions,
		notes: null as string | null,
		language: 'nl',
		cuisine: (ld.recipeCuisine ?? null) as string | null
		,rawIngredients
		,structureVersion: 1
		,structureDraft: null
		,enrichmentReviewReason: null
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

	const rawIngredients: string[] = (raw.ingredients_raw ?? []).map(String);
	const ingredients: Ingredient[] = rawIngredients.map(parseRawIngredient);
	return {
		title: (raw.aliases?.[0] ?? raw.title ?? '') as string,
		category: normalizeFoodCategory((raw.recipe_category ?? null) as string | null),
		servings: (raw.servings ?? null) as number | null,
		totalTimeMin: (raw.total_time_min ?? null) as number | null,
		sourceUrl: url,
		imageUrl: null as string | null,
		ingredients,
		directions: (raw.directions ?? []) as string[],
		notes: (raw.notes ?? null) as string | null,
		language: (raw.language ?? 'nl') as string,
		cuisine: (raw.cuisine ?? null) as string | null,
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
export function reviewFields(reason: string | null): {
	needsReview: boolean;
	reviewReason: string | null;
} {
	return { needsReview: reason !== null, reviewReason: reason };
}

/**
 * Why an ingested recipe should be flagged for review, or null when it's clean.
 * Two trigger classes: hard gaps that make the recipe unusable (no ingredients /
 * no directions), and a non-Dutch source — ingredient names are the Albert Heijn
 * lookup key and must stay Dutch (CLAUDE.md §Critical), so a scraped English/other
 * page needs a human pass. Missing servings is added to the reason for context but
 * never triggers a flag on its own (too common to be signal).
 */
function scrapeReview(data: ScrapedRecipe): string | null {
	const gaps: string[] = [];
	if (data.ingredients.length === 0) gaps.push('no ingredients found');
	if (data.directions.length === 0) gaps.push('no directions found');
	// language is 'nl' | 'en' | 'mixed' from the AI path; JSON-LD assumes 'nl'.
	if (data.language && data.language !== 'nl')
		gaps.push('non-Dutch source — ingredient names may need Dutch for Albert Heijn');
	if (gaps.length === 0) return null;
	const detail = data.servings == null ? [...gaps, 'servings unknown'] : gaps;
	return `Imported from URL — please check: ${detail.join(', ')}.`;
}

/** Insert an extracted recipe with a unique slug + review flag. Shared by route + tool. */
export function insertScrapedRecipe(
	db: DB,
	data: ScrapedRecipe
): { slug: string; title: string; needsReview: boolean; reviewReason: string | null } {
	const review = reviewFields(data.enrichmentReviewReason ?? scrapeReview(data));
	const slug = uniqueSlug(db, slugify(data.title));
	const now = new Date();

	const recipe = db
		.insert(schema.recipes)
		.values({
			slug,
			title: data.title,
			category: data.category,
			tags: [],
			servings: data.servings,
			structureVersion: data.structureVersion,
			structureDraft: data.structureDraft,
			structureDraftSourceUpdatedAt: data.structureDraft ? now : null,
			totalTimeMin: data.totalTimeMin,
			sourceUrl: data.sourceUrl,
			imageUrl: data.imageUrl,
			ingredients: data.ingredients,
			directions: data.directions,
			notes: data.notes,
			rating: null,
			cuisine: data.cuisine,
			language: data.language ?? 'nl',
			...review,
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();

	// Cooking view renders these saved directions directly. Translation remains
	// the only optional eager AI job after import.
	if (getAutoTranslateOnImport()) kickTranslateOnImport(recipe.slug);

	return { slug: recipe.slug, title: recipe.title, ...review };
}
