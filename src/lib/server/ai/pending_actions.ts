// In-memory store for chat actions awaiting user approval (P5.3).
//
// The chat agent defers a few genuinely destructive/merging ops instead of
// executing them (see commit_risk.ts). The deferred call is stashed here under
// a server-issued random token; the client only ever echoes that token back to
// POST /api/chat/confirm. A forged `{confirmed:true}` can never execute — the
// only execution path is claiming a token that the server itself minted.
//
// Single Railway instance → an in-memory Map is sufficient. A durable
// `pending_actions` table is the documented upgrade path if this ever
// multi-instances (a claim would then need a DB-level atomic delete).
import { randomBytes } from 'crypto';
import type { WritePrecondition } from '$lib/server/inventory_writes';

export type PendingAction = {
	userId: number;
	toolName: string;
	/** Raw tool input, replayed verbatim through the inventory boundary on approve. */
	args: unknown;
	/** Exact target state at card time; the boundary re-checks it on commit. */
	precondition: WritePrecondition;
	summary: string;
	createdAt: number;
};

const TTL_MS = 5 * 60 * 1000; // approvals go stale after 5 minutes
const store = new Map<string, PendingAction>();

function sweep(now: number): void {
	for (const [token, action] of store) {
		if (now - action.createdAt > TTL_MS) store.delete(token);
	}
}

/** Stash a deferred action and return its single-use token. */
export function createPendingAction(action: Omit<PendingAction, 'createdAt'>): string {
	const now = Date.now();
	sweep(now);
	const token = randomBytes(18).toString('base64url');
	store.set(token, { ...action, createdAt: now });
	return token;
}

/**
 * Atomically claim a token: get-then-delete. JS is single-threaded, so the
 * delete makes this exactly-once — a double-click or two tabs racing to approve
 * resolve to one winner (the loser gets null). Also enforces the userId scope
 * and TTL. Returns null if unknown, foreign, or expired.
 */
export function claimPendingAction(token: string, userId: number): PendingAction | null {
	const action = store.get(token);
	if (!action) return null;
	store.delete(token);
	if (action.userId !== userId) return null;
	if (Date.now() - action.createdAt > TTL_MS) return null;
	return action;
}
