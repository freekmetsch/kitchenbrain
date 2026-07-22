import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';
import { addDays, todayIso, weekStartFor } from '$lib/week';
import { materializeShoppingWeek } from '$lib/server/shopping_entries';
import { normalizeNameKey } from '$lib/match';

type DB = BetterSQLite3Database<typeof schema>;

export class ShoppingMutationError extends Error {
	constructor(
		public code: 'not_found' | 'stale' | 'past_week' | 'invalid_source' | 'invalid_term' | 'already_resolved',
		message: string
	) {
		super(message);
	}
}

function assertNonpastWeek(weekStart: string, weekStartDay: number, today = todayIso()): void {
	if (weekStart < weekStartFor(today, weekStartDay)) {
		throw new ShoppingMutationError('past_week', 'Captured past shopping weeks cannot be changed');
	}
}

export function addRecurringShoppingItem(
	db: DB,
	input: { name: string; amount?: string | null; unit?: string | null; startWeek: string; weekStartDay: number }
) {
	assertNonpastWeek(input.startWeek, input.weekStartDay);
	const now = new Date();
	return db
		.insert(schema.recurringShoppingItems)
		.values({
			name: input.name,
			amount: input.amount ?? null,
			unit: input.unit ?? null,
			startWeek: input.startWeek,
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();
}

export function editRecurringShoppingItem(
	db: DB,
	input: {
		id: number;
		expectedRevision: number;
		effectiveWeek: string;
		weekStartDay: number;
		name: string;
		amount?: string | null;
		unit?: string | null;
	}
) {
	assertNonpastWeek(input.effectiveWeek, input.weekStartDay);
	return db.transaction((tx) => {
		const executor = tx as unknown as DB;
		const current = executor
			.select()
			.from(schema.recurringShoppingItems)
			.where(eq(schema.recurringShoppingItems.id, input.id))
			.get();
		if (!current) throw new ShoppingMutationError('not_found', 'Weekly shopping item not found');
		if (current.revision !== input.expectedRevision) {
			throw new ShoppingMutationError('stale', 'Weekly shopping item changed; reload it before editing');
		}
		if (input.effectiveWeek < current.startWeek || (current.endWeek && input.effectiveWeek > current.endWeek)) {
			throw new ShoppingMutationError('invalid_source', 'The edit week is outside this item range');
		}
		const now = new Date();
		if (input.effectiveWeek === current.startWeek) {
			return executor
				.update(schema.recurringShoppingItems)
				.set({
					name: input.name,
					amount: input.amount ?? null,
					unit: input.unit ?? null,
					revision: sql`${schema.recurringShoppingItems.revision} + 1`,
					updatedAt: now
				})
				.where(
					and(
						eq(schema.recurringShoppingItems.id, input.id),
						eq(schema.recurringShoppingItems.revision, input.expectedRevision)
					)
				)
				.returning()
				.get();
		}
		executor
			.update(schema.recurringShoppingItems)
			.set({
				endWeek: addDays(input.effectiveWeek, -7),
				revision: sql`${schema.recurringShoppingItems.revision} + 1`,
				updatedAt: now
			})
			.where(
				and(
					eq(schema.recurringShoppingItems.id, input.id),
					eq(schema.recurringShoppingItems.revision, input.expectedRevision)
				)
			)
			.run();
		return executor
			.insert(schema.recurringShoppingItems)
			.values({
				name: input.name,
				amount: input.amount ?? null,
				unit: input.unit ?? null,
				startWeek: input.effectiveWeek,
				endWeek: current.endWeek,
				createdAt: now,
				updatedAt: now
			})
			.returning()
			.get();
	});
}

export function disableRecurringShoppingItem(
	db: DB,
	input: { id: number; expectedRevision: number; effectiveWeek: string; weekStartDay: number }
): void {
	assertNonpastWeek(input.effectiveWeek, input.weekStartDay);
	const current = db
		.select()
		.from(schema.recurringShoppingItems)
		.where(eq(schema.recurringShoppingItems.id, input.id))
		.get();
	if (!current) throw new ShoppingMutationError('not_found', 'Weekly shopping item not found');
	if (current.revision !== input.expectedRevision) throw new ShoppingMutationError('stale', 'Weekly shopping item changed');
	if (input.effectiveWeek === current.startWeek) {
		// Captured week rows are self-contained snapshots and keep their source
		// label even after the durable item is removed before its first week.
		db.delete(schema.recurringShoppingItems).where(eq(schema.recurringShoppingItems.id, current.id)).run();
		return;
	}
	const result = db
		.update(schema.recurringShoppingItems)
		.set({
			endWeek: addDays(input.effectiveWeek, -7),
			revision: sql`${schema.recurringShoppingItems.revision} + 1`,
			updatedAt: new Date()
		})
		.where(
			and(
				eq(schema.recurringShoppingItems.id, input.id),
				eq(schema.recurringShoppingItems.revision, input.expectedRevision)
			)
		)
		.run();
	if (result.changes !== 1) throw new ShoppingMutationError('stale', 'Weekly shopping item changed');
}

export function skipShoppingEntry(
	db: DB,
	input: { entryId: number; expectedRevision: number; weekStartDay: number }
) {
	const entry = db
		.select()
		.from(schema.shoppingWeekEntries)
		.where(eq(schema.shoppingWeekEntries.id, input.entryId))
		.get();
	if (!entry || entry.sourceKind !== 'weekly' || entry.retiredAt) {
		throw new ShoppingMutationError('invalid_source', 'Active weekly occurrence not found');
	}
	assertNonpastWeek(entry.weekStartDate, input.weekStartDay);
	const updated = db
		.update(schema.shoppingWeekEntries)
		.set({ included: false, revision: sql`${schema.shoppingWeekEntries.revision} + 1`, updatedAt: new Date() })
		.where(
			and(
				eq(schema.shoppingWeekEntries.id, input.entryId),
				eq(schema.shoppingWeekEntries.revision, input.expectedRevision)
			)
		)
		.returning()
		.get();
	if (!updated) throw new ShoppingMutationError('stale', 'Weekly occurrence changed');
	return updated;
}

export function addManualShoppingEntry(
	db: DB,
	input: { weekStart: string; weekStartDay: number; name: string; amount?: string | null; unit?: string | null }
) {
	assertNonpastWeek(input.weekStart, input.weekStartDay);
	return db.transaction((tx) => {
		const executor = tx as unknown as DB;
		const now = new Date();
		const row = executor
			.insert(schema.shoppingWeekEntries)
			.values({
				weekStartDate: input.weekStart,
				sourceKey: `manual:pending:${globalThis.crypto.randomUUID()}`,
				sourceKind: 'manual',
				name: input.name,
				amount: input.amount ?? null,
				unit: input.unit ?? null,
				approvedTerms: [input.name],
				createdAt: now,
				updatedAt: now
			})
			.returning()
			.get();
		return executor
			.update(schema.shoppingWeekEntries)
			.set({ sourceKey: `manual:${row.id}` })
			.where(eq(schema.shoppingWeekEntries.id, row.id))
			.returning()
			.get();
	});
}

export function removeManualShoppingEntry(
	db: DB,
	input: { entryId: number; expectedRevision: number; weekStartDay: number }
): void {
	const entry = db
		.select()
		.from(schema.shoppingWeekEntries)
		.where(eq(schema.shoppingWeekEntries.id, input.entryId))
		.get();
	if (!entry || entry.sourceKind !== 'manual' || entry.retiredAt) {
		throw new ShoppingMutationError('invalid_source', 'Active manual shopping item not found');
	}
	assertNonpastWeek(entry.weekStartDate, input.weekStartDay);
	const result = db
		.update(schema.shoppingWeekEntries)
		.set({
			retiredAt: new Date(),
			revision: sql`${schema.shoppingWeekEntries.revision} + 1`,
			updatedAt: new Date()
		})
		.where(
			and(
				eq(schema.shoppingWeekEntries.id, input.entryId),
				eq(schema.shoppingWeekEntries.revision, input.expectedRevision),
				isNull(schema.shoppingWeekEntries.retiredAt)
			)
		)
		.run();
	if (result.changes !== 1) throw new ShoppingMutationError('stale', 'Manual shopping item changed');
}

export function updateShoppingEntry(
	db: DB,
	input: {
		entryId: number;
		expectedRevision: number;
		weekStartDay: number;
		included?: boolean;
		selectedName?: string | null;
		bought?: boolean;
		amountOverride?: string | null;
		unitOverride?: string | null;
	}
) {
	const before = db
		.select()
		.from(schema.shoppingWeekEntries)
		.where(eq(schema.shoppingWeekEntries.id, input.entryId))
		.get();
	if (!before || before.retiredAt) throw new ShoppingMutationError('not_found', 'Shopping source not found');
	if (before.sourceKind === 'legacy' || before.needsReview) {
		throw new ShoppingMutationError('invalid_source', 'Resolve this legacy shopping item before changing it');
	}
	assertNonpastWeek(before.weekStartDate, input.weekStartDay);
	if (before.sourceKind === 'recipe' || before.sourceKind === 'weekly') {
		materializeShoppingWeek(db, before.weekStartDate, { weekStartDay: input.weekStartDay });
	}
	const current = db
		.select()
		.from(schema.shoppingWeekEntries)
		.where(eq(schema.shoppingWeekEntries.id, input.entryId))
		.get();
	if (!current || current.retiredAt) throw new ShoppingMutationError('invalid_source', 'Shopping source is no longer active');
	if (current.revision !== input.expectedRevision) throw new ShoppingMutationError('stale', 'Shopping source changed');
	if (input.selectedName && !current.approvedTerms.includes(input.selectedName)) {
		throw new ShoppingMutationError('invalid_term', 'Choose the Dutch recipe name or a saved Dutch alternative');
	}
	const updated = db
		.update(schema.shoppingWeekEntries)
		.set({
			...(input.included === undefined ? {} : { included: input.included }),
			...(input.selectedName === undefined ? {} : { selectedName: input.selectedName }),
			...(input.bought === undefined ? {} : { bought: input.bought }),
			...(input.amountOverride === undefined ? {} : { amountOverride: input.amountOverride }),
			...(input.unitOverride === undefined ? {} : { unitOverride: input.unitOverride }),
			revision: sql`${schema.shoppingWeekEntries.revision} + 1`,
			updatedAt: new Date()
		})
		.where(
			and(
				eq(schema.shoppingWeekEntries.id, input.entryId),
				eq(schema.shoppingWeekEntries.revision, input.expectedRevision),
				isNull(schema.shoppingWeekEntries.retiredAt)
			)
		)
		.returning()
		.get();
	if (!updated) throw new ShoppingMutationError('stale', 'Shopping source changed');
	return updated;
}

export function setBoughtForEntries(
	db: DB,
	input: { entryIds: number[]; weekStart: string; weekStartDay: number; bought: boolean }
): void {
	assertNonpastWeek(input.weekStart, input.weekStartDay);
	const ids = [...new Set(input.entryIds)];
	if (ids.length === 0) throw new ShoppingMutationError('invalid_source', 'No shopping sources supplied');
	db.transaction((tx) => {
		const executor = tx as unknown as DB;
		const entries = executor
			.select()
			.from(schema.shoppingWeekEntries)
			.where(inArray(schema.shoppingWeekEntries.id, ids))
			.all();
		if (
			entries.length !== ids.length ||
			entries.some((entry) => entry.weekStartDate !== input.weekStart || entry.retiredAt || entry.needsReview)
		) {
			throw new ShoppingMutationError('invalid_source', 'One or more shopping sources are stale or unavailable');
		}
		executor
			.update(schema.shoppingWeekEntries)
			.set({ bought: input.bought, revision: sql`${schema.shoppingWeekEntries.revision} + 1`, updatedAt: new Date() })
			.where(inArray(schema.shoppingWeekEntries.id, ids))
			.run();
	});
}

export function resolveLegacyShoppingEntry(
	db: DB,
	input: {
		legacyEntryId: number;
		expectedLegacyRevision: number;
		action: 'attach' | 'manual' | 'dismiss';
		targetEntryId?: number;
		expectedTargetRevision?: number;
		weekStartDay: number;
	}
) {
	return db.transaction((tx) => {
		const executor = tx as unknown as DB;
		const legacy = executor
			.select()
			.from(schema.shoppingWeekEntries)
			.where(eq(schema.shoppingWeekEntries.id, input.legacyEntryId))
			.get();
		if (!legacy || legacy.sourceKind !== 'legacy') {
			throw new ShoppingMutationError('not_found', 'Legacy shopping row not found');
		}
		if (legacy.resolvedAt) throw new ShoppingMutationError('already_resolved', 'Legacy shopping row is already resolved');
		if (legacy.revision !== input.expectedLegacyRevision) throw new ShoppingMutationError('stale', 'Legacy shopping row changed');
		// Dismissal changes only the retained migration audit row. It must remain
		// available after a captured week closes so old no-match rows cannot block
		// the final migration gate forever. Attach/manual still mutate shopping state.
		if (input.action !== 'dismiss') assertNonpastWeek(legacy.weekStartDate, input.weekStartDay);
		const now = new Date();
		let resolvedSourceKey: string | null = null;

		if (input.action === 'attach') {
			const target = input.targetEntryId == null
				? undefined
				: executor
						.select()
						.from(schema.shoppingWeekEntries)
						.where(eq(schema.shoppingWeekEntries.id, input.targetEntryId))
						.get();
			if (
				!target ||
				target.weekStartDate !== legacy.weekStartDate ||
				target.retiredAt ||
				target.sourceKind === 'legacy' ||
				!(normalizeNameKey(target.name) === normalizeNameKey(legacy.name) ||
					target.approvedTerms.some((term) => normalizeNameKey(term) === normalizeNameKey(legacy.selectedName ?? legacy.name)))
			) {
				throw new ShoppingMutationError('invalid_source', 'Choose an active source from the same week');
			}
			if (input.expectedTargetRevision == null || target.revision !== input.expectedTargetRevision) {
				throw new ShoppingMutationError('stale', 'Target shopping source changed');
			}
			const selectedName = legacy.selectedName && target.approvedTerms.includes(legacy.selectedName)
				? legacy.selectedName
				: null;
			const updatedTarget = executor
				.update(schema.shoppingWeekEntries)
				.set({
					included: legacy.included,
					bought: legacy.bought,
					selectedName,
					amountOverride: legacy.amount,
					unitOverride: legacy.unit,
					revision: sql`${schema.shoppingWeekEntries.revision} + 1`,
					updatedAt: now
				})
				.where(and(eq(schema.shoppingWeekEntries.id, target.id), eq(schema.shoppingWeekEntries.revision, input.expectedTargetRevision)))
				.returning()
				.get();
			if (!updatedTarget) throw new ShoppingMutationError('stale', 'Target shopping source changed');
			resolvedSourceKey = target.sourceKey;
		}

		if (input.action === 'manual') {
			const manual = addManualShoppingEntry(executor, {
				weekStart: legacy.weekStartDate,
				weekStartDay: input.weekStartDay,
				name: legacy.name,
				amount: legacy.amount,
				unit: legacy.unit
			});
			executor
				.update(schema.shoppingWeekEntries)
				.set({ bought: legacy.bought, included: legacy.included, updatedAt: now })
				.where(eq(schema.shoppingWeekEntries.id, manual.id))
				.run();
			resolvedSourceKey = manual.sourceKey;
		}

		const resolved = executor
			.update(schema.shoppingWeekEntries)
			.set({
				resolvedAt: now,
				resolution: input.action === 'attach' ? 'attached' : input.action === 'manual' ? 'manual' : 'dismissed',
				resolvedSourceKey,
				needsReview: false,
				retiredAt: now,
				revision: sql`${schema.shoppingWeekEntries.revision} + 1`,
				updatedAt: now
			})
			.where(and(eq(schema.shoppingWeekEntries.id, legacy.id), eq(schema.shoppingWeekEntries.revision, input.expectedLegacyRevision)))
			.returning()
			.get();
		if (!resolved) throw new ShoppingMutationError('stale', 'Legacy shopping row changed');
		return resolved;
	});
}
