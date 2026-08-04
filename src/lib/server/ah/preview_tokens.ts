import { randomBytes } from 'node:crypto';
import { z } from 'zod';

export type AhPreviewBinding = {
	ref: string;
	entryIds: number[];
	entryRevisions: number[];
	term: string;
	amount: string | null;
	unit: string | null;
	incompatibleQuantities?: boolean;
	quantitySummary?: string | null;
	preferenceSignature?: string;
	offeredProducts: Array<{ id: string; name: string }>;
};

export type AhPreviewToken = {
	userId: number;
	weekStart: string;
	items: AhPreviewBinding[];
	createdAt: number;
	expiresAt: number;
};

export const AhPushDecisionSchema = z.discriminatedUnion('mode', [
	z.object({
		ref: z.string().min(1).max(256),
		mode: z.literal('product'),
		productId: z.string().min(1).max(256),
		qty: z.number().int().min(1).max(99),
		quantityConfirmed: z.boolean().optional()
	}).strict(),
	z.object({ ref: z.string().min(1).max(256), mode: z.literal('freetext') }).strict(),
	z.object({ ref: z.string().min(1).max(256), mode: z.literal('exclude') }).strict()
]);
export const AhPushBodySchema = z.object({
	previewToken: z.string().min(20).max(256),
	decisions: z.array(AhPushDecisionSchema).min(1).max(200)
}).strict();
export type AhPushDecision = z.infer<typeof AhPushDecisionSchema>;

export function isAhEligibleShoppingRow(row: {
	covered: boolean;
	sources: Array<{ term: string; approvedTerms: string[] }>;
}): boolean {
	return !row.covered && row.sources.every((source) => source.approvedTerms.includes(source.term));
}

export function bindAhPushDecisions(items: AhPreviewBinding[], decisions: AhPushDecision[]): Map<string, AhPushDecision> {
	const byRef = new Map<string, AhPushDecision>();
	for (const decision of decisions) {
		if (byRef.has(decision.ref)) throw new Error('Each preview item needs one decision');
		byRef.set(decision.ref, decision);
	}
	if (items.some((item) => !byRef.has(item.ref)) || [...byRef.keys()].some((ref) => !items.some((item) => item.ref === ref))) {
		throw new Error('Push decisions do not match this preview');
	}
	for (const item of items) {
		const decision = byRef.get(item.ref)!;
		if (decision.mode === 'product' && !item.offeredProducts.some((product) => product.id === decision.productId)) {
			throw new Error('Choose a product offered for this shopping item');
		}
		if (decision.mode === 'product' && item.incompatibleQuantities && decision.quantityConfirmed !== true) {
			throw new Error('Confirm the pack quantity for items with different source amounts');
		}
	}
	return byRef;
}

const TTL_MS = 10 * 60 * 1000;
const MAX_TOKENS = 200;
const MAX_PRODUCTS_PER_ROW = 100;
const tokens = new Map<string, AhPreviewToken>();
const latestByUserWeek = new Map<string, string>();

function previewKey(userId: number, weekStart: string): string {
	return `${userId}:${weekStart}`;
}

function deleteToken(token: string): void {
	const value = tokens.get(token);
	if (!value) return;
	tokens.delete(token);
	const key = previewKey(value.userId, value.weekStart);
	if (latestByUserWeek.get(key) === token) latestByUserWeek.delete(key);
}

function prune(now: number): void {
	for (const [token, value] of tokens) if (value.expiresAt <= now) deleteToken(token);
	while (tokens.size >= MAX_TOKENS) deleteToken(tokens.keys().next().value!);
}

function clonePreview(value: AhPreviewToken): AhPreviewToken {
	return {
		...value,
		items: value.items.map((item) => ({
			...item,
			entryIds: [...item.entryIds],
			entryRevisions: [...item.entryRevisions],
			offeredProducts: item.offeredProducts.map((product) => ({ ...product }))
		}))
	};
}

function validPreview(token: string, userId: number, now: number): AhPreviewToken | null {
	const value = tokens.get(token);
	if (!value) return null;
	if (value.expiresAt <= now) {
		deleteToken(token);
		return null;
	}
	if (value.userId !== userId) return null;
	return value;
}

export function createAhPreviewToken(
	input: Omit<AhPreviewToken, 'createdAt' | 'expiresAt'>,
	options: { now?: number; ttlMs?: number } = {}
): string {
	const now = options.now ?? Date.now();
	prune(now);
	const key = previewKey(input.userId, input.weekStart);
	const previous = latestByUserWeek.get(key);
	if (previous) deleteToken(previous);
	const token = randomBytes(24).toString('base64url');
	tokens.set(
		token,
		clonePreview({
			...input,
			createdAt: now,
			expiresAt: now + (options.ttlMs ?? TTL_MS)
		})
	);
	latestByUserWeek.set(key, token);
	return token;
}

/** Reads a current preview without consuming or exposing its mutable server copy. */
export function peekAhPreviewToken(
	token: string,
	userId: number,
	now = Date.now()
): AhPreviewToken | null {
	const value = validPreview(token, userId, now);
	return value ? clonePreview(value) : null;
}

/** Extends an active review without replacing its token or mutable product authorization. */
export function refreshAhPreviewToken(token: string, userId: number, now = Date.now()): boolean {
	const value = validPreview(token, userId, now);
	if (!value) return false;
	value.expiresAt = now + TTL_MS;
	return true;
}

/** Adds products discovered by a manual search to one bound row, up to a fixed cap. */
export function offerAhPreviewProducts(
	token: string,
	userId: number,
	ref: string,
	products: Array<{ id: string; name: string }>,
	now = Date.now()
): string[] | null {
	const value = validPreview(token, userId, now);
	if (!value) return null;
	const item = value.items.find((candidate) => candidate.ref === ref);
	if (!item) return null;
	const existing = new Set(item.offeredProducts.map((product) => product.id));
	const authorized = new Set<string>();
	for (const product of products) {
		if (existing.has(product.id)) {
			authorized.add(product.id);
			continue;
		}
		if (item.offeredProducts.length >= MAX_PRODUCTS_PER_ROW) continue;
		item.offeredProducts.push({ id: product.id, name: product.name });
		existing.add(product.id);
		authorized.add(product.id);
	}
	value.expiresAt = now + TTL_MS;
	return [...authorized];
}

/** Claims once. A failed or stale push must return to a fresh preview. */
export function claimAhPreviewToken(token: string, userId: number, now = Date.now()): AhPreviewToken | null {
	const value = validPreview(token, userId, now);
	if (!value) return null;
	deleteToken(token);
	return clonePreview(value);
}

export function clearAhPreviewTokensForTest(): void {
	tokens.clear();
	latestByUserWeek.clear();
}
