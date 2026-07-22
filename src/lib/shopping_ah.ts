// Shared client-facing shapes for the AH shopping preview/push flow (Phase 2).
// Pure types — no server imports — so the SvelteKit endpoints and the shopping
// page reference one contract and cannot drift.
import { z } from 'zod';

export const packQuantitySchema = z.number().int().min(1).max(99);

export type PreviewProduct = {
	id: string;
	name: string;
	/** currentPrice ?? priceBeforeBonus — what to show as the headline price. */
	price: number | null;
	/** Pre-bonus price, for strike-through display when isBonus. */
	regularPrice: number | null;
	isBonus: boolean;
	bonusMechanism: string | null;
	salesUnitSize: string | null;
	/** Effective (bonus-adjusted) unit price, preformatted for display, e.g. "€3.50/kg" — the same value ranking sorts on. */
	unitPrice: string | null;
	imageUrl: string | null;
	isPreviouslyBought: boolean;
	/** Suggested pack quantity for this candidate, derived from item amount vs this product's salesUnitSize. */
	qty: number;
	/** Total pack price divided by a known count (eggs, buns, wraps, etc.). */
	pricePerCount: number | null;
	/** Household favorite for this ingredient name — pinned to the top, wins over ranking and the AI pick. */
	isFavorite?: boolean;
};

/**
 * product  — AH returned results; candidates[0] is the default pick.
 * freetext — AH returned zero results; item goes as a Dutch free-text line.
 * unknown  — AH search errored (retryable); pushed as free text as a fallback.
 */
export type PreviewStatus = 'product' | 'freetext' | 'unknown';

export type PreviewItem = {
	/** Stable per-item reference so duplicate names with different amounts never cross-wire. */
	ref: string;
	/** Canonical Dutch recipe/list identity; never replaced by a substitute. */
	sourceName: string;
	/** Dutch shopping-list item name (the AH search term). */
	term: string;
	amount: string | null;
	unit: string | null;
	purchaseForm?: 'fresh' | 'preserved' | 'frozen' | 'dried' | 'any';
	status: PreviewStatus;
	/** Ranked candidates for status 'product' (top-10 batch, up to 24 on re-search); empty otherwise. */
	candidates: PreviewProduct[];
	/** Best candidate shares no word with the term — AH resolved a pure synonym. */
	lowConfidence: boolean;
};

// --- Push request: the modal's resolved per-item decisions ----------------

export type PushProduct = { ref: string; sourceName: string; term: string; amount: string | null; unit: string | null; id: string; name: string; qty: number };
export type PushFreetext = { ref: string; sourceName: string; term: string; amount: string | null; unit: string | null };
export type PushSkipped = { ref: string; sourceName: string; term: string; amount: string | null; unit: string | null };
