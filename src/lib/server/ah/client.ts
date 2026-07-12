import { readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { dirname } from 'path';

const BASE_URL = 'https://api.ah.nl';
const HEADERS: Record<string, string> = {
	'User-Agent': 'Appie/9.28 (iPhone17,3; iPhone; CPU OS 26_1 like Mac OS X)',
	'x-client-name': 'appie-ios',
	'x-client-version': '9.28',
	'x-application': 'AHWEBSHOP',
	'Content-Type': 'application/json',
	Accept: 'application/json'
};

const TOKEN_FILE = process.env.AH_TOKEN_FILE ?? './ah_tokens.json';

/** Wire sentinel for the not-connected state — single source for every endpoint. */
export const AH_NOT_CONNECTED = 'not_connected' as const;

/** Thrown by auth-required calls when no valid member tokens exist. Never falls back to anonymous. */
export class AHNotConnectedError extends Error {
	code = AH_NOT_CONNECTED;
	constructor(message = 'Not connected to Albert Heijn') {
		super(message);
		this.name = 'AHNotConnectedError';
	}
}

// --- Member token store -------------------------------------------------
// File-backed; written ONLY by the validated Settings connect flow and by
// refresh rotation. The v2+member marker guards against pre-fix files that
// the old clobber bug filled with anonymous tokens: marker-less files are
// treated as not_connected and deleted.

type MemberTokens = {
	v: 2;
	member: true;
	access_token: string;
	refresh_token: string;
	member_name?: string;
};

/** Single place that stamps the v2+member marker the loader's migration guard checks. */
function makeMemberTokens(
	pair: { access_token: string; refresh_token: string },
	memberName?: string
): MemberTokens {
	return { v: 2, member: true, ...pair, member_name: memberName };
}

let _member: MemberTokens | null | undefined; // undefined = not loaded yet
let _refreshing: Promise<MemberTokens> | null = null;

// Anonymous search token lives in memory only — never persisted, fully
// separate from the member store so shared helpers cannot contaminate it.
let _anonToken: string | null = null;

function loadMemberTokens(): MemberTokens | null {
	if (_member !== undefined) return _member;
	try {
		const raw = JSON.parse(readFileSync(TOKEN_FILE, 'utf-8'));
		if (raw?.v === 2 && raw?.member === true && typeof raw.refresh_token === 'string' && raw.refresh_token) {
			_member = {
				v: 2,
				member: true,
				access_token: String(raw.access_token ?? ''),
				refresh_token: raw.refresh_token,
				member_name: raw.member_name ? String(raw.member_name) : undefined
			};
		} else {
			console.error('[ah] token file lacks v2 member marker (legacy/anon-contaminated) — clearing');
			_member = null;
			try {
				unlinkSync(TOKEN_FILE);
			} catch {
				/* already gone */
			}
		}
	} catch {
		_member = null;
	}
	return _member;
}

function saveMemberTokens(t: MemberTokens): void {
	mkdirSync(dirname(TOKEN_FILE), { recursive: true });
	const tmp = `${TOKEN_FILE}.tmp`;
	writeFileSync(tmp, JSON.stringify(t), 'utf-8');
	renameSync(tmp, TOKEN_FILE);
	_member = t;
}

function clearMemberTokens(): void {
	_member = null;
	try {
		unlinkSync(TOKEN_FILE);
	} catch {
		/* already gone */
	}
}

export function getAHStatus(): { connected: boolean; memberName: string | null } {
	const m = loadMemberTokens();
	return { connected: m !== null, memberName: m?.member_name ?? null };
}

// --- Auth flows ----------------------------------------------------------

async function getAnonToken(force = false): Promise<string> {
	if (_anonToken && !force) return _anonToken;
	const r = await fetch(`${BASE_URL}/mobile-auth/v1/auth/token/anonymous`, {
		method: 'POST',
		headers: HEADERS,
		body: JSON.stringify({ clientId: 'appie-ios' })
	});
	if (!r.ok) throw new Error(`AH anon token failed: ${r.status}`);
	_anonToken = (await r.json()).access_token as string;
	return _anonToken;
}

/** The one home of the AH refresh contract (endpoint, clientId, response shape). */
async function postTokenRefresh(
	refreshToken: string
): Promise<{ ok: boolean; status: number; pair?: { access_token: string; refresh_token: string } }> {
	const r = await fetch(`${BASE_URL}/mobile-auth/v1/auth/token/refresh`, {
		method: 'POST',
		headers: HEADERS,
		body: JSON.stringify({ clientId: 'appie-ios', refreshToken })
	});
	if (!r.ok) return { ok: false, status: r.status };
	const d = await r.json();
	return {
		ok: true,
		status: r.status,
		pair: {
			access_token: d.access_token as string,
			refresh_token: (d.refresh_token as string | undefined) ?? refreshToken
		}
	};
}

async function refreshMemberTokens(refreshToken: string): Promise<MemberTokens> {
	if (_refreshing) return _refreshing;
	_refreshing = (async () => {
		const res = await postTokenRefresh(refreshToken);
		// A Settings reconnect can land a NEW lineage while this refresh of the OLD
		// one is in flight — never clear or overwrite tokens we didn't refresh.
		const lineageCurrent = () => loadMemberTokens()?.refresh_token === refreshToken;
		if (!res.ok) {
			console.error(`[ah] member token refresh failed: ${res.status}`);
			if (res.status >= 400 && res.status < 500) {
				// Refresh token rejected — stale tokens are dead, don't retry them forever.
				if (lineageCurrent()) clearMemberTokens();
				throw new AHNotConnectedError('AH rejected the refresh token — reconnect in Settings');
			}
			throw new Error(`AH refresh failed: ${res.status}`);
		}
		const t = makeMemberTokens(res.pair!, loadMemberTokens()?.member_name);
		if (lineageCurrent()) {
			try {
				saveMemberTokens(t);
			} catch (e) {
				// Keep serving from memory; on restart the stale file forces a reconnect.
				console.error(`[ah] failed to persist rotated tokens: ${e instanceof Error ? e.message : e}`);
				_member = t;
			}
		}
		return t;
	})().finally(() => {
		_refreshing = null;
	});
	return _refreshing;
}

async function ahFetch(
	method: string,
	path: string,
	opts: {
		params?: Record<string, string>;
		body?: unknown;
		auth?: boolean;
		headers?: Record<string, string>;
	} = {}
): Promise<Response> {
	const buildUrl = () => {
		const u = new URL(`${BASE_URL}${path}`);
		if (opts.params) Object.entries(opts.params).forEach(([k, v]) => u.searchParams.set(k, v));
		return u.toString();
	};

	const doReq = (tok: string) =>
		fetch(buildUrl(), {
			method,
			headers: { ...HEADERS, ...opts.headers, Authorization: `Bearer ${tok}` },
			body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
		});

	let r: Response;
	if (opts.auth) {
		// Member scope: file-backed member tokens only, never anonymous.
		const m = loadMemberTokens();
		if (!m) throw new AHNotConnectedError();
		const token = m.access_token || (await refreshMemberTokens(m.refresh_token)).access_token;
		r = await doReq(token);
		if (r.status === 401) {
			const current = loadMemberTokens();
			if (!current) throw new AHNotConnectedError();
			r = await doReq((await refreshMemberTokens(current.refresh_token)).access_token);
		}
	} else {
		// Anonymous scope: in-memory token, re-fetched on 401 — never touches the member store.
		r = await doReq(await getAnonToken());
		if (r.status === 401) r = await doReq(await getAnonToken(true));
	}
	console.log(`[ah] ${method} ${path} -> ${r.status}${opts.auth ? ' (member)' : ''}`);
	return r;
}

// --- Member identity validation ------------------------------------------
// Anonymous tokens get a ghost member with null email/name from the same
// query (verified live 2026-07-07), so "member data returned" is NOT enough:
// a real identity field (email or first name) is required. Shopping-list
// calls also succeed anonymously, which is exactly the ghost-push root cause
// — never use them for validation.

const MEMBER_IDENTITY_QUERY = `query FetchMember {
  member {
    id
    emailAddress
    name { first }
  }
}`;

async function fetchMemberIdentity(accessToken: string): Promise<string | null> {
	const r = await fetch(`${BASE_URL}/graphql`, {
		method: 'POST',
		headers: { ...HEADERS, Authorization: `Bearer ${accessToken}` },
		body: JSON.stringify({ query: MEMBER_IDENTITY_QUERY })
	});
	console.log(`[ah] POST /graphql member-identity -> ${r.status}`);
	if (!r.ok) return null;
	const d = await r.json();
	if (d.errors?.length) {
		console.error(`[ah] member identity query error: ${d.errors[0]?.message ?? 'unknown'}`);
		return null;
	}
	const m = d.data?.member;
	const identity = (m?.name?.first as string | undefined) || (m?.emailAddress as string | undefined);
	return identity ?? null;
}

/**
 * Validate a pasted token pair against the AH member API and persist it.
 * The refresh token is ALWAYS exercised — validating only the access token
 * would let a mixed pair (member access + anon/stale refresh) persist under
 * the member marker and ghost-push again after expiry. Rejects anonymous and
 * garbage tokens (fail-closed). The rotated pair is what gets persisted — a
 * paste payload is one-shot: after a save the app owns that lineage.
 */
export async function connectAH(
	pasted: { access_token?: string; refresh_token?: string }
): Promise<{ ok: true; memberName: string } | { ok: false; reason: string }> {
	const refresh = (pasted.refresh_token ?? '').trim();
	if (!refresh) return { ok: false, reason: 'The payload has no refresh_token — paste the full JSON line the login script prints.' };

	const res = await postTokenRefresh(refresh);
	console.log(`[ah] POST /mobile-auth/v1/auth/token/refresh (connect) -> ${res.status}`);
	if (!res.ok) return { ok: false, reason: 'Albert Heijn rejected these tokens — run the login script again for a fresh payload.' };

	const identity = await fetchMemberIdentity(res.pair!.access_token);
	if (!identity) {
		return {
			ok: false,
			reason: 'These tokens are not signed in to an AH account (anonymous session) — run the login script and complete the Albert Heijn login.'
		};
	}

	saveMemberTokens(makeMemberTokens(res.pair!, identity));
	console.log('[ah] member tokens validated and connected');
	return { ok: true, memberName: identity };
}

// --- Product search + shopping list --------------------------------------

export interface AHProduct {
	id: string;
	name: string;
	/** Regular (pre-bonus) price; present on non-bonus items. Display `currentPrice ?? priceBeforeBonus`. */
	priceBeforeBonus: number | null;
	/** Current shelf price; often null — fall back to priceBeforeBonus for display. */
	currentPrice: number | null;
	isBonus: boolean;
	/** e.g. "2e Halve Prijs", "3 voor 5.00". Null when not on bonus. */
	bonusMechanism: string | null;
	/** e.g. "500 g", "6 stuks" — drives quantity derivation. */
	salesUnitSize: string | null;
	/** e.g. "prijs per kg €3.50" — parsed for the cheapest-per-unit tie-break. */
	unitPriceDescription: string | null;
	/** 200px rendition when available (modal thumbnails). */
	imageUrl: string | null;
	/** Only meaningful with a member token; always false on anonymous search. */
	isPreviouslyBought: boolean;
	/** AH taxonomy, e.g. "Groente, aardappelen" / "Drogisterij" — ranking demotes non-food. */
	mainCategory: string | null;
}

/**
 * Search outcome distinguishes a genuine empty result (demote to free text)
 * from a transport/API failure (keep the item, retryable) — the old contract
 * collapsed both to `[]`, hiding AH outages behind silent free-text demotion.
 */
export type SearchOutcome = { ok: true; products: AHProduct[] } | { ok: false };

/** Pick the ~200px rendition from AH's image set (`w`/`width` field), else the first. */
function pickImageUrl(images: unknown): string | null {
	if (!Array.isArray(images) || !images.length) return null;
	const withUrl = images.filter((im): im is Record<string, unknown> => !!im && typeof im === 'object' && 'url' in im);
	if (!withUrl.length) return null;
	const at200 = withUrl.find((im) => Number(im.w ?? im.width) === 200);
	return String((at200 ?? withUrl[0]).url ?? '') || null;
}

function mapProduct(p: Record<string, unknown>): AHProduct {
	return {
		id: String(p.webshopId ?? p.id ?? ''),
		name: String(p.title ?? ''),
		priceBeforeBonus: typeof p.priceBeforeBonus === 'number' ? p.priceBeforeBonus : null,
		currentPrice: typeof p.currentPrice === 'number' ? p.currentPrice : null,
		isBonus: p.isBonus === true,
		bonusMechanism: p.bonusMechanism ? String(p.bonusMechanism) : null,
		salesUnitSize: p.salesUnitSize ? String(p.salesUnitSize) : null,
		unitPriceDescription: p.unitPriceDescription ? String(p.unitPriceDescription) : null,
		imageUrl: pickImageUrl(p.images),
		isPreviouslyBought: p.isPreviouslyBought === true,
		mainCategory: p.mainCategory ? String(p.mainCategory) : null
	};
}

export async function searchProducts(query: string, size = 5): Promise<SearchOutcome> {
	try {
		// AH-INVARIANT: this query source must remain Dutch for product catalogue matching.
		// Member-scoped so isPreviouslyBought reflects the household's history — the
		// only caller (ah-preview) already fails closed when not connected.
		const r = await ahFetch('GET', '/mobile-services/product/search/v2', {
			auth: true,
			params: { query: query.slice(0, 100), size: String(size) }
		});
		if (!r.ok) return { ok: false };
		const data = await r.json();
		const products = ((data.products as Record<string, unknown>[]) ?? []).map(mapProduct);
		return { ok: true, products };
	} catch {
		return { ok: false };
	}
}

/**
 * Batch-fetch products by webshop id — used to surface a pinned favorite that
 * the search pool didn't return. REST batch endpoint verified 2026-07-08
 * (same one that carries bonusMechanism text). Returns [] on any failure so a
 * missing favorite degrades to "not shown", never breaks the preview.
 */
export async function getProductsByIds(ids: string[]): Promise<AHProduct[]> {
	if (!ids.length) return [];
	try {
		const qs = ids.map((id) => `ids=${encodeURIComponent(id)}`).join('&');
		const r = await ahFetch('GET', `/mobile-services/product/search/v2/products?${qs}`, { auth: true });
		if (!r.ok) return [];
		const data = await r.json();
		return ((data.products as Record<string, unknown>[]) ?? []).map(mapProduct);
	} catch {
		return [];
	}
}

/** Push free-text lines, accounting per chunk of 10 — a late-chunk failure names its items. */
export async function addFreetextItems(items: string[]): Promise<{ pushed: string[]; failed: string[] }> {
	const pushed: string[] = [];
	const failed: string[] = [];
	const CHUNK = 10;
	for (let i = 0; i < items.length; i += CHUNK) {
		const chunk = items.slice(i, i + CHUNK);
		const r = await ahFetch('PATCH', '/mobile-services/shoppinglist/v2/items', {
			auth: true,
			body: {
				items: chunk.map((name) => ({
					// AH-INVARIANT: free-text shopping descriptions must remain Dutch.
					description: name,
					quantity: 1,
					type: 'SHOPPABLE',
					originCode: 'PRD',
					strikeThrough: false
				}))
			}
		});
		if (r.ok) pushed.push(...chunk);
		else {
			const errBody = (await r.text().catch(() => '')).slice(0, 500);
			console.error(`[ah] freetext chunk failed: ${r.status} (${chunk.length} items) body: ${errBody}`);
			failed.push(...chunk);
		}
	}
	console.log(`[ah] freetext push: ${pushed.length} ok, ${failed.length} failed`);
	return { pushed, failed };
}

export async function addProductItems(
	products: Array<{ id: string; qty: number }>
): Promise<{ ok: boolean; status: number }> {
	if (!products.length) return { ok: true, status: 200 };
	const r = await ahFetch('PATCH', '/mobile-services/shoppinglist/v2/items', {
		auth: true,
		body: {
			items: products.map(({ id, qty }) => ({
				productId: Number(id),
				quantity: qty,
				type: 'SHOPPABLE',
				originCode: 'PRD',
				description: '',
				strikeThrough: false
			}))
		}
	});
	if (!r.ok) {
		const errBody = (await r.text().catch(() => '')).slice(0, 500);
		console.error(`[ah] product push failed: ${r.status} body: ${errBody}`);
	} else {
		console.log(`[ah] product push -> ${r.status} (${products.length} items)`);
	}
	return { ok: r.ok, status: r.status };
}

// --- Active order (open basket) -------------------------------------------
// When the account has an open order (an unplaced basket — the household's
// normal state), AH locks the shopping-list write path ("Server in order
// mode", 412). Product adds must then target the order API instead.
// Endpoints mirror appie-go (order.go): the summaries/active GET also yields
// the order id that write calls send as the appie-current-order-id header.

export interface AHActiveOrder {
	id: number;
	state: string;
	totalPrice: number;
	totalDiscount: number;
	items: Array<{ productId: number; title: string; quantity: number }>;
}

interface OrderSummaryResponse {
	id?: number;
	state?: string;
	totalPrice?: { priceTotalPayable?: number; priceDiscount?: number };
	orderedProducts?: Array<{ quantity?: number; product?: { webshopId?: number; title?: string } }>;
}

export async function getActiveOrder(): Promise<AHActiveOrder | null> {
	const r = await ahFetch('GET', '/mobile-services/order/v1/summaries/active', {
		params: { sortBy: 'DEFAULT' },
		auth: true
	});
	if (!r.ok) return null; // no open order (or summary unavailable) — callers fall back to the list
	const d = (await r.json()) as OrderSummaryResponse;
	return {
		id: Number(d.id ?? 0),
		state: String(d.state ?? ''),
		totalPrice: Number(d.totalPrice?.priceTotalPayable ?? 0),
		totalDiscount: Number(d.totalPrice?.priceDiscount ?? 0),
		items: (d.orderedProducts ?? []).map((op) => ({
			productId: Number(op.product?.webshopId ?? 0),
			title: String(op.product?.title ?? ''),
			quantity: Number(op.quantity ?? 1)
		}))
	};
}

export async function addProductsToOrder(
	orderId: number,
	products: Array<{ id: string; qty: number }>
): Promise<{ ok: boolean; status: number }> {
	if (!products.length) return { ok: true, status: 200 };
	// AH rejects duplicate productIds in one request — merge quantities.
	const merged = new Map<number, number>();
	for (const { id, qty } of products) merged.set(Number(id), (merged.get(Number(id)) ?? 0) + qty);
	const r = await ahFetch('PUT', '/mobile-services/order/v1/items', {
		params: { sortBy: 'DEFAULT' },
		auth: true,
		headers: { 'appie-current-order-id': String(orderId) },
		body: {
			items: [...merged].map(([productId, quantity]) => ({
				productId,
				quantity,
				originCode: 'PRD',
				description: '',
				strikethrough: false
			}))
		}
	});
	if (!r.ok) {
		const errBody = (await r.text().catch(() => '')).slice(0, 500);
		console.error(`[ah] order push failed: ${r.status} body: ${errBody}`);
	} else {
		console.log(`[ah] order push -> ${r.status} (${merged.size} products, order ${orderId})`);
	}
	return { ok: r.ok, status: r.status };
}
