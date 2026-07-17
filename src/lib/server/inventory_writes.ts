// Centralized inventory mutation boundary (P1.5, ADR 0001).
// The ONLY module allowed to mutate inventory_items. Every mutation runs in a
// transaction, applies the taxonomy rules (canonical units, leftover portions,
// deterministic review flags), and writes exactly one inventory_ops_log row
// with actor attribution and before/after snapshots. Undo never rewrites
// history: it applies the inverse as a new op with undo_of set (G3).
import { and, desc, eq, isNull, like, asc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';
import type { InventoryActor } from '$lib/server/db/schema';
import { normalizeFoodCategory } from '$lib/food_categories';
import {
	inferFoodClassFromName,
	isCanonicalUnit,
	isKind,
	normalizeFoodClass,
	normalizeUnit,
	type Kind
} from '$lib/food_class';
import {
	findOrMergeInventory,
	readInventoryItem,
	type DbOrTx,
	type FindOrMergeInventoryInput
} from '$lib/server/inventory_merge';
import { autoStapleOnLink } from '$lib/server/freezer_staple';
import { isRuleReason, reasonTokens } from '$lib/review_reasons';

type DB = BetterSQLite3Database<typeof schema>;
type InventoryItem = typeof schema.inventoryItems.$inferSelect;
type InventoryOp = typeof schema.inventoryOpsLog.$inferSelect;
type Section = 'freezer' | 'pantry';

export type WriteCtx = { actor: InventoryActor; userId?: number };

// A deferred chat action (P5.3) carries the exact state its target had when the
// approval card was shown. The boundary re-checks it in-transaction at commit
// time so a stale approval (the item drifted underneath) refuses instead of
// silently overwriting/merging into a changed item.
export type WritePrecondition = { itemId: number; expectedSnapshot: ItemSnapshot };

/** Thrown when a WritePrecondition no longer matches at commit time. */
export class PreconditionConflictError extends Error {
	constructor(message = 'That item changed since the approval was requested.') {
		super(message);
		this.name = 'PreconditionConflictError';
	}
}

/** In-transaction guard: current item must still equal the approved snapshot. */
function assertPrecondition(current: InventoryItem | undefined, precondition: WritePrecondition): void {
	if (
		!current ||
		current.deletedAt ||
		current.id !== precondition.itemId ||
		!snapshotsEqual(toSnapshot(current), precondition.expectedSnapshot)
	) {
		throw new PreconditionConflictError();
	}
}

// ── Snapshots ────────────────────────────────────────────────────────────────

// Fields that define an item's undo-relevant state. updatedAt (always churns)
// and legacy tags are deliberately excluded from equality checks.
const SNAPSHOT_COMPARE_FIELDS = [
	'id',
	'name',
	'qtyText',
	'qtyNum',
	'unit',
	'section',
	'category',
	'kind',
	'foodClass',
	'madeFromRecipeId',
	'recipeStatus',
	'recipeStatusAt',
	'needsReview',
	'reviewReason',
	'isStaple',
	'expiryDate',
	'createdAt',
	'deletedAt'
] as const;

const DATE_FIELDS = new Set(['recipeStatusAt', 'createdAt', 'updatedAt', 'deletedAt']);
const BOOLEAN_FIELDS = new Set(['needsReview', 'isStaple']);

export type ItemSnapshot = Record<string, unknown>;

function msOrNull(value: unknown): number | null {
	if (value === null || value === undefined) return null;
	if (value instanceof Date) return value.getTime();
	if (typeof value === 'number') return value;
	if (typeof value === 'string') {
		const parsed = Date.parse(value);
		return Number.isNaN(parsed) ? null : parsed;
	}
	return null;
}

/** Plain-JSON item state for history rows: Date fields as epoch ms. */
export function toSnapshot(item: InventoryItem): ItemSnapshot {
	const snapshot: ItemSnapshot = {};
	for (const field of [...SNAPSHOT_COMPARE_FIELDS, 'updatedAt', 'tags'] as const) {
		const value = item[field as keyof InventoryItem];
		snapshot[field] = DATE_FIELDS.has(field) ? msOrNull(value) : (value ?? null);
	}
	return snapshot;
}

function normalizeForCompare(field: string, value: unknown): unknown {
	if (DATE_FIELDS.has(field)) return msOrNull(value);
	if (BOOLEAN_FIELDS.has(field)) return Boolean(value);
	return value ?? null;
}

function snapshotsEqual(a: ItemSnapshot, b: ItemSnapshot): boolean {
	return SNAPSHOT_COMPARE_FIELDS.every(
		(field) => normalizeForCompare(field, a[field]) === normalizeForCompare(field, b[field])
	);
}

// ── Taxonomy rules (deterministic; the AI guardian is Phase 3) ───────────────

type TaxonomyInput = {
	kind?: string | null;
	foodClass?: string | null;
	unit?: string | null;
	qtyNum?: number | null;
	name?: string | null;
	madeFromRecipeId?: number | null;
};

type TaxonomyResult = {
	kind: Kind | null;
	foodClass: string | null;
	unit: string | null;
	needsReview: boolean;
	reviewReason: string | null;
};

function applyTaxonomyRules(input: TaxonomyInput): TaxonomyResult {
	const reasons: string[] = [];

	let kind: Kind | null = null;
	if (input.kind) {
		if (isKind(input.kind)) kind = input.kind;
		else reasons.push(`unknown_kind:${input.kind}`);
	}

	let foodClass: string | null = null;
	if (input.foodClass) {
		foodClass = normalizeFoodClass(input.foodClass);
		if (!foodClass) reasons.push(`unknown_food_class:${input.foodClass}`);
	}

	// P3.2 inference — fills blanks only, never overrides an explicit value
	// (a rejected explicit value keeps its review flag and stays null).
	// A recipe-linked item is a leftover by definition; the leftover unit
	// rules below then apply to the inferred kind as usual.
	if (kind === null && !input.kind && input.madeFromRecipeId != null) kind = 'leftover';
	if (foodClass === null && !input.foodClass && input.name) {
		foodClass = inferFoodClassFromName(input.name);
	}

	let unit = input.unit === undefined || input.unit === null ? null : normalizeUnit(input.unit);
	if (unit === '') unit = null;
	if (unit && !isCanonicalUnit(unit)) reasons.push(`non_canonical_unit:${unit}`);

	if (kind === 'leftover') {
		// Countable units convert silently (1 stuk = 1 portion) — flagging a unit
		// the user can't "resolve" without changing it is a dead end (UX-STOCK-1).
		// Measured units (g/kg/ml/l) still flag: the portion count is unknowable.
		if (!unit || unit === 'stuk') unit = 'portion';
		else if (unit !== 'portion') reasons.push('leftover_non_portion_unit');
		if (
			input.qtyNum !== undefined &&
			input.qtyNum !== null &&
			!Number.isInteger(input.qtyNum)
		) {
			reasons.push('leftover_non_integer_portions');
		}
	}

	return {
		kind,
		foodClass,
		unit,
		needsReview: reasons.length > 0,
		reviewReason: reasons.length ? reasons.join('; ') : null
	};
}

// ── History logging ──────────────────────────────────────────────────────────

type LogOpArgs = {
	opType: 'add' | 'remove' | 'update';
	itemId: number;
	before: ItemSnapshot | null;
	after: ItemSnapshot | null;
	undoOf?: number | null;
	provenance?: unknown;
};

function logOp(db: DbOrTx, ctx: WriteCtx, args: LogOpArgs): number | null {
	const userId =
		ctx.userId ??
		db
			.select({ id: schema.users.id })
			.from(schema.users)
			.orderBy(asc(schema.users.id))
			.limit(1)
			.get()?.id;

	if (!userId) {
		console.warn('[inventory] skipped op log: no user available');
		return null;
	}

	const row = db
		.insert(schema.inventoryOpsLog)
		.values({
			userId,
			opType: args.opType,
			itemSnapshot: args.provenance ?? null,
			actor: ctx.actor,
			itemId: args.itemId,
			beforeSnapshot: args.before,
			afterSnapshot: args.after,
			undoOf: args.undoOf ?? null,
			createdAt: new Date()
		})
		.returning({ id: schema.inventoryOpsLog.id })
		.get();

	return row?.id ?? null;
}

// ── Public write API ─────────────────────────────────────────────────────────

export type AddInventoryInput = Omit<
	FindOrMergeInventoryInput,
	'kind' | 'foodClass' | 'needsReview' | 'reviewReason'
> & {
	kind?: string | null;
	foodClass?: string | null;
};

export type AddInventoryResult = {
	action: 'add' | 'update';
	item: InventoryItem;
	verified: boolean;
	matchedBy?: 'normalized-key' | 'qualified-name';
	warnings: string[];
	opId: number | null;
};

export function addInventory(
	db: DB,
	input: AddInventoryInput,
	ctx: WriteCtx,
	precondition?: WritePrecondition
): AddInventoryResult {
	const rules = applyTaxonomyRules(input);
	return db.transaction((tx) => {
		// P5.3 approve path: the merge target must still match what the user saw.
		if (precondition) assertPrecondition(readInventoryItem(tx, precondition.itemId), precondition);
		const result = findOrMergeInventory(tx, {
			...input,
			unit: rules.unit,
			kind: rules.kind,
			foodClass: rules.foodClass,
			needsReview: rules.needsReview,
			reviewReason: rules.reviewReason
		});
		// Keep-stocked contract (UX-STOCK-14): a linked leftover implies its
		// recipe is a freezer staple, unless the recipe carries an opt-out.
		// Same transaction; every write path (freeze, chat, UI) funnels here.
		if (result.item.kind === 'leftover' && result.item.madeFromRecipeId != null) {
			autoStapleOnLink(tx, result.item.madeFromRecipeId);
		}
		const opId = logOp(tx, ctx, {
			opType: result.action,
			itemId: result.item.id,
			before: result.before ? toSnapshot(result.before) : null,
			after: toSnapshot(result.item),
			provenance:
				result.action === 'update'
					? {
							source: 'find_or_merge',
							mergedFrom: {
								name: input.name,
								section: input.section,
								qtyText: input.qtyText ?? null,
								qtyNum: input.qtyNum ?? null,
								unit: input.unit ?? null,
								createdAt: input.createdAt ?? null
							},
							matchedBy: result.matchedBy,
							warnings: result.warnings
						}
					: { source: 'find_or_merge' }
		});
		return {
			action: result.action,
			item: result.item,
			verified: result.verified,
			matchedBy: result.matchedBy,
			warnings: result.warnings,
			opId
		};
	});
}

export type UpdateInventoryInput = Partial<{
	name: string;
	qtyText: string | null;
	qtyNum: number | null;
	unit: string | null;
	section: Section;
	category: string | null;
	kind: string | null;
	foodClass: string | null;
	madeFromRecipeId: number | null;
	recipeStatus: 'linked' | 'plan_to_add' | 'no_recipe' | null;
	isStaple: boolean;
	needsReview: boolean;
	reviewReason: string | null;
	expiryDate: string | null;
	createdAt: Date;
	tags: string[];
}>;

export type UpdateInventoryResult =
	| { ok: true; item: InventoryItem; opId: number | null }
	| { ok: false; error: string };

export function updateInventory(
	db: DB,
	id: number,
	input: UpdateInventoryInput,
	ctx: WriteCtx
): UpdateInventoryResult {
	return db.transaction((tx) => {
		const before = readInventoryItem(tx, id);
		if (!before) return { ok: false as const, error: 'Item not found' };

		const updates: Record<string, unknown> = { updatedAt: new Date() };
		if (input.name !== undefined) updates.name = input.name.trim();
		if (input.qtyText !== undefined) updates.qtyText = input.qtyText;
		if (input.qtyNum !== undefined) updates.qtyNum = input.qtyNum;
		if (input.section !== undefined) updates.section = input.section;
		if (input.category !== undefined) updates.category = normalizeFoodCategory(input.category);
		if (input.madeFromRecipeId !== undefined) updates.madeFromRecipeId = input.madeFromRecipeId;
		if (input.recipeStatus !== undefined) {
			updates.recipeStatus = input.recipeStatus;
			updates.recipeStatusAt = new Date();
		}
		if (input.isStaple !== undefined) updates.isStaple = input.isStaple;
		if (input.expiryDate !== undefined) updates.expiryDate = input.expiryDate;
		if (input.createdAt !== undefined) updates.createdAt = input.createdAt;
		if (input.tags !== undefined) updates.tags = input.tags;

		// Taxonomy rules run against the resulting state so a kind change and a
		// unit change interact correctly (e.g. reclassify to leftover). Passing
		// name + madeFromRecipeId lets the P3.2 inference fill blanks; existing
		// values pass through the normalizer unchanged.
		const rules = applyTaxonomyRules({
			kind: input.kind !== undefined ? input.kind : before.kind,
			foodClass: input.foodClass !== undefined ? input.foodClass : before.foodClass,
			unit: input.unit !== undefined ? input.unit : before.unit,
			qtyNum: input.qtyNum !== undefined ? input.qtyNum : before.qtyNum,
			name: input.name !== undefined ? input.name : before.name,
			madeFromRecipeId:
				input.madeFromRecipeId !== undefined ? input.madeFromRecipeId : before.madeFromRecipeId
		});
		if (input.kind !== undefined || rules.kind !== (before.kind ?? null)) updates.kind = rules.kind;
		if (input.foodClass !== undefined || rules.foodClass !== (before.foodClass ?? null)) {
			updates.foodClass = rules.foodClass;
		}
		if (input.unit !== undefined || rules.unit !== normalizeUnit(before.unit)) {
			updates.unit = rules.unit;
		}

		// Review state = live rule reasons + sticky reasons. Rule-derived codes are
		// server-owned: recomputed from the resulting state each write, so fixing
		// the offending fact clears them without a separate resolve. Sticky codes
		// persist until an explicit resolve (needs_review: false), which clears
		// them — but never the still-live rule reasons.
		const sticky =
			input.needsReview === false
				? []
				: input.needsReview === true
					? reasonTokens(input.reviewReason ?? before.reviewReason).filter((t) => !isRuleReason(t))
					: reasonTokens(before.reviewReason).filter((t) => !isRuleReason(t));
		const allReasons = [...new Set([...reasonTokens(rules.reviewReason), ...sticky])];
		updates.needsReview = allReasons.length > 0;
		updates.reviewReason = allReasons.length ? allReasons.join('; ') : null;

		const item = tx
			.update(schema.inventoryItems)
			.set(updates)
			.where(eq(schema.inventoryItems.id, id))
			.returning()
			.get();
		if (!item) return { ok: false as const, error: 'Item not found' };

		// Keep-stocked contract (UX-STOCK-14): fire only when the item BECOMES a
		// linked leftover — unrelated edits of an already-linked one skip the
		// recipe read (and can't re-staple pre-opt-out-era recipes on a qty tap).
		if (
			item.kind === 'leftover' &&
			item.madeFromRecipeId != null &&
			(before.kind !== 'leftover' || before.madeFromRecipeId !== item.madeFromRecipeId)
		) {
			autoStapleOnLink(tx, item.madeFromRecipeId);
		}

		const opId = logOp(tx, ctx, {
			opType: 'update',
			itemId: id,
			before: toSnapshot(before),
			after: toSnapshot(item)
		});
		return { ok: true as const, item, opId };
	});
}

export type RemoveInventoryTarget = { id?: number; name?: string; section?: Section };

export type RemoveInventoryResult =
	| { ok: true; item: InventoryItem; verified: boolean; opId: number | null }
	| { ok: false; error: string };

/**
 * Readonly resolve of a remove/mutate target: by id (returns even a soft-deleted
 * row, for idempotent re-delete), else the first non-deleted fuzzy name match in
 * the optional section. Shared so the commit-risk classifier snapshots exactly
 * the row removeInventory will act on.
 */
export function resolveInventoryTarget(
	db: DbOrTx,
	target: RemoveInventoryTarget
): InventoryItem | undefined {
	if (target.id) return readInventoryItem(db, target.id);
	if (target.name) {
		return db
			.select()
			.from(schema.inventoryItems)
			.where(
				and(
					isNull(schema.inventoryItems.deletedAt),
					like(schema.inventoryItems.name, `%${target.name}%`),
					target.section ? eq(schema.inventoryItems.section, target.section) : undefined
				)
			)
			.get();
	}
	return undefined;
}

export function removeInventory(
	db: DB,
	target: RemoveInventoryTarget,
	ctx: WriteCtx,
	precondition?: WritePrecondition
): RemoveInventoryResult {
	return db.transaction((tx) => {
		const item = resolveInventoryTarget(tx, target);
		if (!item) return { ok: false as const, error: 'Item not found' };

		// P5.3 approve path: refuse if the target drifted since the card was shown.
		if (precondition) assertPrecondition(item, precondition);

		const before = toSnapshot(item);
		tx.update(schema.inventoryItems)
			.set({ deletedAt: new Date() })
			.where(eq(schema.inventoryItems.id, item.id))
			.run();

		const verified = readInventoryItem(tx, item.id);
		const opId = logOp(tx, ctx, {
			opType: 'remove',
			itemId: item.id,
			before,
			after: null
		});
		return {
			ok: true as const,
			item,
			verified: Boolean(verified?.deletedAt),
			opId
		};
	});
}

// ── Undo (compensating ops, G3) ──────────────────────────────────────────────

export type UndoResult =
	| { ok: true; item: InventoryItem; opId: number | null }
	| { ok: false; error: string; conflict?: boolean };

function restoreUpdatesFromSnapshot(snapshot: ItemSnapshot): Record<string, unknown> {
	const updates: Record<string, unknown> = { updatedAt: new Date() };
	for (const field of SNAPSHOT_COMPARE_FIELDS) {
		if (field === 'id') continue;
		const value = snapshot[field];
		if (DATE_FIELDS.has(field)) {
			const ms = msOrNull(value);
			updates[field] = ms === null ? null : new Date(ms);
		} else if (BOOLEAN_FIELDS.has(field)) {
			updates[field] = Boolean(value);
		} else {
			updates[field] = value ?? null;
		}
	}
	return updates;
}

function flagUndoConflict(tx: DbOrTx, ctx: WriteCtx, itemId: number, opId: number): void {
	const before = readInventoryItem(tx, itemId);
	if (!before) return;
	const item = tx
		.update(schema.inventoryItems)
		.set({
			needsReview: true,
			reviewReason: `undo_conflict:op_${opId}`,
			updatedAt: new Date()
		})
		.where(eq(schema.inventoryItems.id, itemId))
		.returning()
		.get();
	if (item) {
		logOp(tx, ctx, {
			opType: 'update',
			itemId,
			before: toSnapshot(before),
			after: toSnapshot(item)
		});
	}
}

/**
 * Scoped undo (G3): revert opId only if the item still exists and its current
 * state matches the op's after-state; otherwise flag the item Needs Review and
 * refuse. The inverse is written as a NEW op with undo_of set.
 */
export function undoOp(db: DB, opId: number, ctx: WriteCtx): UndoResult {
	return db.transaction((tx) => {
		const op: InventoryOp | undefined = tx
			.select()
			.from(schema.inventoryOpsLog)
			.where(eq(schema.inventoryOpsLog.id, opId))
			.get();
		if (!op) return { ok: false as const, error: 'Op not found' };
		if (!op.itemId) {
			return { ok: false as const, error: 'Op has no item reference (legacy history is display-only)' };
		}

		const current = readInventoryItem(tx, op.itemId);
		if (!current) return { ok: false as const, error: 'Item no longer exists' };

		const after = op.afterSnapshot as ItemSnapshot | null;
		const before = op.beforeSnapshot as ItemSnapshot | null;

		if (op.opType === 'add') {
			if (!after) return { ok: false as const, error: 'Op is not undoable (no after-state stored)' };
			if (current.deletedAt || !snapshotsEqual(toSnapshot(current), after)) {
				flagUndoConflict(tx, ctx, current.id, opId);
				return { ok: false as const, conflict: true, error: 'Item changed since this op; flagged for review instead' };
			}
			const item = tx
				.update(schema.inventoryItems)
				.set({ deletedAt: new Date() })
				.where(eq(schema.inventoryItems.id, current.id))
				.returning()
				.get();
			const newOpId = logOp(tx, ctx, {
				opType: 'remove',
				itemId: current.id,
				before: toSnapshot(current),
				after: null,
				undoOf: opId
			});
			return { ok: true as const, item, opId: newOpId };
		}

		if (op.opType === 'update') {
			if (!before || !after) {
				return { ok: false as const, error: 'Op is not undoable (legacy history is display-only)' };
			}
			if (current.deletedAt || !snapshotsEqual(toSnapshot(current), after)) {
				flagUndoConflict(tx, ctx, current.id, opId);
				return { ok: false as const, conflict: true, error: 'Item changed since this op; flagged for review instead' };
			}
			const item = tx
				.update(schema.inventoryItems)
				.set(restoreUpdatesFromSnapshot(before))
				.where(eq(schema.inventoryItems.id, current.id))
				.returning()
				.get();
			const newOpId = logOp(tx, ctx, {
				opType: 'update',
				itemId: current.id,
				before: toSnapshot(current),
				after: item ? toSnapshot(item) : null,
				undoOf: opId
			});
			return { ok: true as const, item, opId: newOpId };
		}

		// op_type === 'remove': restore the soft-deleted item.
		if (!before) return { ok: false as const, error: 'Op is not undoable (no before-state stored)' };
		if (!current.deletedAt) {
			flagUndoConflict(tx, ctx, current.id, opId);
			return { ok: false as const, conflict: true, error: 'Item is not deleted anymore; flagged for review instead' };
		}
		const item = tx
			.update(schema.inventoryItems)
			.set({ deletedAt: null, updatedAt: new Date() })
			.where(eq(schema.inventoryItems.id, current.id))
			.returning()
			.get();
		const newOpId = logOp(tx, ctx, {
			opType: 'add',
			itemId: current.id,
			before: null,
			after: item ? toSnapshot(item) : null,
			undoOf: opId
		});
		return { ok: true as const, item, opId: newOpId };
	});
}

/**
 * Adapter for the legacy `{ item_id }` undo contract: undo the latest remove
 * op for the item. Falls back to a plain logged restore for soft-deleted items
 * whose remove predates op-level history.
 */
export function undoLatestRemoveForItem(db: DB, itemId: number, ctx: WriteCtx): UndoResult {
	const lastRemove = db
		.select({ id: schema.inventoryOpsLog.id })
		.from(schema.inventoryOpsLog)
		.where(
			and(eq(schema.inventoryOpsLog.itemId, itemId), eq(schema.inventoryOpsLog.opType, 'remove'))
		)
		.orderBy(desc(schema.inventoryOpsLog.id))
		.limit(1)
		.get();

	if (lastRemove) return undoOp(db, lastRemove.id, ctx);

	return db.transaction((tx) => {
		const current = readInventoryItem(tx, itemId);
		if (!current) return { ok: false as const, error: 'Item not found' };
		if (!current.deletedAt) return { ok: false as const, error: 'Item is not deleted' };
		const item = tx
			.update(schema.inventoryItems)
			.set({ deletedAt: null, updatedAt: new Date() })
			.where(eq(schema.inventoryItems.id, itemId))
			.returning()
			.get();
		const opId = logOp(tx, ctx, {
			opType: 'add',
			itemId,
			before: null,
			after: item ? toSnapshot(item) : null,
			provenance: { source: 'legacy_restore' }
		});
		return { ok: true as const, item, opId };
	});
}

export type ReviewFlagResult =
	| { ok: true; item: InventoryItem; opId: number | null }
	| { ok: false; error: string };

/** Flag (reason set) or resolve (reason null) an item's Needs Review state. */
export function setReviewFlag(
	db: DB,
	itemId: number,
	reason: string | null,
	ctx: WriteCtx
): ReviewFlagResult {
	return updateInventory(
		db,
		itemId,
		reason === null ? { needsReview: false, reviewReason: null } : { needsReview: true, reviewReason: reason },
		ctx
	);
}
