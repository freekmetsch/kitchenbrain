import { and, asc, eq, gte, isNull, lt, lte, or, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { normalizeNameKey } from '$lib/match';
import * as schema from '$lib/server/db/schema';
import { deriveWeekNeeds, type ShoppingSourceContribution } from '$lib/server/shopping_needs';
import { addDays, todayIso, weekKeyRange, weekStartFor } from '$lib/week';
import { getHouseholdPref, setHouseholdPref } from '$lib/server/db/household_prefs';

type DB = BetterSQLite3Database<typeof schema>;
type WeekEntry = typeof schema.shoppingWeekEntries.$inferSelect;

export type MaterializeResult = {
	status: 'materialized' | 'existing' | 'history_not_captured';
	created: number;
	updated: number;
	retired: number;
};

export type LegacyImportBucket = 'manual' | 'exact' | 'unmatched' | 'ambiguous';
export type LegacyImportReport = {
	total: number;
	manual: number;
	exact: number;
	unmatched: number;
	ambiguous: number;
	alreadyImported: number;
};

export const K_SHOPPING_SOURCE_MIGRATION = 'shopping.source_entries.v1';

function intPref(db: DB, key: string, min: number, max: number, fallback: number): number {
	const value = Number.parseInt(getHouseholdPref(db, key) ?? '', 10);
	return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

export function shoppingPlanningConfig(db: DB): {
	weekStartDay: number;
	planAheadWeeks: number;
	currentWeek: string;
} {
	const weekStartDay = intPref(db, 'mealplan.week_start_day', 0, 6, 2);
	return {
		weekStartDay,
		planAheadWeeks: intPref(db, 'mealplan.plan_ahead_weeks', 1, 8, 4),
		currentWeek: weekStartFor(todayIso(), weekStartDay)
	};
}

export function isShoppingSourceMigrationComplete(db: DB): boolean {
	return getHouseholdPref(db, K_SHOPPING_SOURCE_MIGRATION) === 'complete';
}

function mealsForWeek(db: DB, weekStart: string) {
	const range = weekKeyRange(weekStart);
	return db
		.select()
		.from(schema.mealPlanMeals)
		.where(
			and(
				gte(schema.mealPlanMeals.weekStartDate, range.from),
				lt(schema.mealPlanMeals.weekStartDate, range.to)
			)
		)
		.orderBy(asc(schema.mealPlanMeals.sortOrder), asc(schema.mealPlanMeals.id))
		.all();
}

function recipeSourcesForWeek(db: DB, weekStart: string): ShoppingSourceContribution[] {
	return deriveWeekNeeds(db, mealsForWeek(db, weekStart)).needed.flatMap((item) => item.sources);
}

function activeRecurringForWeek(db: DB, weekStart: string) {
	return db
		.select()
		.from(schema.recurringShoppingItems)
		.where(
			and(
				lte(schema.recurringShoppingItems.startWeek, weekStart),
				or(isNull(schema.recurringShoppingItems.endWeek), gte(schema.recurringShoppingItems.endWeek, weekStart))
			)
		)
		.orderBy(asc(schema.recurringShoppingItems.id))
		.all();
}

function sameJson(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function derivedValuesChanged(existing: WeekEntry, next: Partial<WeekEntry>): boolean {
	return Object.entries(next).some(([key, value]) => {
		const current = existing[key as keyof WeekEntry];
		return Array.isArray(value) ? !sameJson(current, value) : current !== value;
	});
}

function insertRecipeEntry(
	db: DB,
	weekStart: string,
	source: ShoppingSourceContribution,
	now: Date
): void {
	db.insert(schema.shoppingWeekEntries)
		.values({
			weekStartDate: weekStart,
			sourceKey: source.ref.key,
			sourceKind: 'recipe',
			recipeId: source.ref.recipeId,
			recipeSlug: source.ref.recipeSlug,
			ingredientId: source.ref.ingredientId,
			name: source.name,
			amount: source.amount || null,
			unit: source.unit ?? null,
			component: source.component,
			mealIds: source.ref.mealIds,
			approvedTerms: [source.name, ...source.substitutes],
			included: !source.optional,
			createdAt: now,
			updatedAt: now
		})
		.run();
}

/**
 * Capture one nonpast shopping week. Existing source state stays attached only
 * to the same stable key; derived names, amounts and approved terms refresh.
 */
export function materializeShoppingWeek(
	db: DB,
	weekStart: string,
	options: { weekStartDay: number; today?: string; allowPastForMigration?: boolean }
): MaterializeResult {
	const currentWeek = weekStartFor(options.today ?? todayIso(), options.weekStartDay);
	const existingCount = db
		.select({ count: sql<number>`count(*)` })
		.from(schema.shoppingWeekEntries)
		.where(eq(schema.shoppingWeekEntries.weekStartDate, weekStart))
		.get()!.count;
	if (weekStart < currentWeek && !options.allowPastForMigration) {
		return existingCount === 0
			? { status: 'history_not_captured', created: 0, updated: 0, retired: 0 }
			: { status: 'existing', created: 0, updated: 0, retired: 0 };
	}

	return db.transaction((tx): MaterializeResult => {
		const executor = tx as unknown as DB;
		const recipeSources = recipeSourcesForWeek(executor, weekStart);
		const recurring = activeRecurringForWeek(executor, weekStart);
		const expectedKeys = new Set<string>([
			...recipeSources.map((source) => source.ref.key),
			...recurring.map((item) => `weekly:${item.id}`)
		]);
		const now = new Date();
		const existing = executor
			.select()
			.from(schema.shoppingWeekEntries)
			.where(eq(schema.shoppingWeekEntries.weekStartDate, weekStart))
			.all();
		const byKey = new Map(existing.map((entry) => [entry.sourceKey, entry]));
		let created = 0;
		let updated = 0;
		let retired = 0;

		for (const source of recipeSources) {
			const current = byKey.get(source.ref.key);
			if (!current) {
				insertRecipeEntry(executor, weekStart, source, now);
				created++;
				continue;
			}
			const approvedTerms = [source.name, ...source.substitutes];
			const selectedName = current.selectedName && approvedTerms.includes(current.selectedName)
				? current.selectedName
				: null;
			const changes: Partial<WeekEntry> = {
				recipeId: source.ref.recipeId,
				recipeSlug: source.ref.recipeSlug,
				ingredientId: source.ref.ingredientId,
				name: source.name,
				amount: source.amount || null,
				unit: source.unit ?? null,
				component: source.component,
				mealIds: source.ref.mealIds,
				approvedTerms,
				selectedName,
				retiredAt: null
			};
			if (derivedValuesChanged(current, changes)) {
				executor
					.update(schema.shoppingWeekEntries)
					.set({ ...changes, revision: sql`${schema.shoppingWeekEntries.revision} + 1`, updatedAt: now })
					.where(eq(schema.shoppingWeekEntries.id, current.id))
					.run();
				updated++;
			}
		}

		for (const item of recurring) {
			const sourceKey = `weekly:${item.id}`;
			const current = byKey.get(sourceKey);
			if (!current) {
				executor
					.insert(schema.shoppingWeekEntries)
					.values({
						weekStartDate: weekStart,
						sourceKey,
						sourceKind: 'weekly',
						recurringItemId: item.id,
						name: item.name,
						amount: item.amount,
						unit: item.unit,
						approvedTerms: [item.name],
						createdAt: now,
						updatedAt: now
					})
					.run();
				created++;
				continue;
			}
			const changes: Partial<WeekEntry> = {
				name: item.name,
				amount: item.amount,
				unit: item.unit,
				approvedTerms: [item.name],
				selectedName: null,
				retiredAt: null
			};
			if (derivedValuesChanged(current, changes)) {
				executor
					.update(schema.shoppingWeekEntries)
					.set({ ...changes, revision: sql`${schema.shoppingWeekEntries.revision} + 1`, updatedAt: now })
					.where(eq(schema.shoppingWeekEntries.id, current.id))
					.run();
				updated++;
			}
		}

		for (const entry of existing) {
			if (
				(entry.sourceKind === 'recipe' || entry.sourceKind === 'weekly') &&
				entry.retiredAt == null &&
				!expectedKeys.has(entry.sourceKey)
			) {
				executor
					.update(schema.shoppingWeekEntries)
					.set({ retiredAt: now, revision: sql`${schema.shoppingWeekEntries.revision} + 1`, updatedAt: now })
					.where(eq(schema.shoppingWeekEntries.id, entry.id))
					.run();
				retired++;
			}
		}

		return {
			status: existing.length === 0 ? 'materialized' : 'existing',
			created,
			updated,
			retired
		};
	});
}

function emptyLegacyReport(): LegacyImportReport {
	return { total: 0, manual: 0, exact: 0, unmatched: 0, ambiguous: 0, alreadyImported: 0 };
}

function bucketLegacyOverride(db: DB, override: typeof schema.shoppingListOverrides.$inferSelect): {
	bucket: LegacyImportBucket;
	candidates: ShoppingSourceContribution[];
} {
	if (override.manual) return { bucket: 'manual', candidates: [] };
	const key = normalizeNameKey(override.name);
	const candidates = recipeSourcesForWeek(db, override.weekStartDate).filter(
		(source) => normalizeNameKey(source.name) === key
	);
	if (
		candidates.length === 1 &&
		(!override.selectedName || [candidates[0].name, ...candidates[0].substitutes].includes(override.selectedName))
	) {
		return { bucket: 'exact', candidates };
	}
	if (candidates.length === 1) return { bucket: 'unmatched', candidates };
	return { bucket: candidates.length === 0 ? 'unmatched' : 'ambiguous', candidates };
}

function claimedLegacySourceKeys(db: DB): Set<string> {
	return new Set(
		db
			.select({ week: schema.shoppingWeekEntries.weekStartDate, sourceKey: schema.shoppingWeekEntries.sourceKey })
			.from(schema.shoppingWeekEntries)
			.where(and(eq(schema.shoppingWeekEntries.sourceKind, 'recipe'), sql`${schema.shoppingWeekEntries.legacyOverrideId} IS NOT NULL`))
			.all()
			.map((row) => `${row.week}\u0000${row.sourceKey}`)
	);
}

function reserveExactLegacySource(
	weekStartDate: string,
	classified: ReturnType<typeof bucketLegacyOverride>,
	claimed: Set<string>
): ReturnType<typeof bucketLegacyOverride> {
	if (classified.bucket !== 'exact') return classified;
	const claim = `${weekStartDate}\u0000${classified.candidates[0].ref.key}`;
	if (claimed.has(claim)) return { bucket: 'ambiguous', candidates: classified.candidates };
	claimed.add(claim);
	return classified;
}

export function dryRunLegacyOverrideImport(db: DB): LegacyImportReport {
	const report = emptyLegacyReport();
	const claimed = claimedLegacySourceKeys(db);
	const overrides = db.select().from(schema.shoppingListOverrides).orderBy(asc(schema.shoppingListOverrides.id)).all();
	for (const override of overrides) {
		report.total++;
		const imported = db
			.select({ id: schema.shoppingWeekEntries.id })
			.from(schema.shoppingWeekEntries)
			.where(eq(schema.shoppingWeekEntries.legacyOverrideId, override.id))
			.get();
		if (imported) {
			report.alreadyImported++;
			continue;
		}
		const classified = reserveExactLegacySource(override.weekStartDate, bucketLegacyOverride(db, override), claimed);
		report[classified.bucket]++;
	}
	return report;
}

/** Import every legacy row once. No row is duplicated and no ambiguous match is guessed. */
export function importLegacyShoppingOverrides(db: DB): LegacyImportReport {
	const report = emptyLegacyReport();
	const claimed = claimedLegacySourceKeys(db);
	const overrides = db.select().from(schema.shoppingListOverrides).orderBy(asc(schema.shoppingListOverrides.id)).all();
	for (const override of overrides) {
		report.total++;
		const alreadyImported = db
			.select({ id: schema.shoppingWeekEntries.id })
			.from(schema.shoppingWeekEntries)
			.where(eq(schema.shoppingWeekEntries.legacyOverrideId, override.id))
			.get();
		if (alreadyImported) {
			report.alreadyImported++;
			continue;
		}
		const classified = reserveExactLegacySource(override.weekStartDate, bucketLegacyOverride(db, override), claimed);
		report[classified.bucket]++;
		db.transaction((tx) => {
			const executor = tx as unknown as DB;
			const now = new Date();
			if (classified.bucket === 'exact') {
				const source = classified.candidates[0];
				const current = executor
					.select()
					.from(schema.shoppingWeekEntries)
					.where(
						and(
							eq(schema.shoppingWeekEntries.weekStartDate, override.weekStartDate),
							eq(schema.shoppingWeekEntries.sourceKey, source.ref.key)
						)
					)
					.get();
				if (!current) insertRecipeEntry(executor, override.weekStartDate, source, now);
				const target = current ?? executor
					.select()
					.from(schema.shoppingWeekEntries)
					.where(
						and(
							eq(schema.shoppingWeekEntries.weekStartDate, override.weekStartDate),
							eq(schema.shoppingWeekEntries.sourceKey, source.ref.key)
						)
					)
					.get()!;
				const approved = target.approvedTerms.includes(override.selectedName ?? '')
					? override.selectedName
					: null;
				executor
					.update(schema.shoppingWeekEntries)
					.set({
						legacyOverrideId: override.id,
						amountOverride: override.amount,
						unitOverride: override.unit,
						included: override.included,
						bought: override.bought,
						selectedName: approved,
						revision: sql`${schema.shoppingWeekEntries.revision} + 1`,
						updatedAt: now
					})
					.where(eq(schema.shoppingWeekEntries.id, target.id))
					.run();
				return;
			}

			const manual = classified.bucket === 'manual';
			executor
				.insert(schema.shoppingWeekEntries)
				.values({
					weekStartDate: override.weekStartDate,
					sourceKey: `${manual ? 'manual' : 'legacy'}:${override.id}`,
					sourceKind: manual ? 'manual' : 'legacy',
					legacyOverrideId: override.id,
					name: override.name,
					amount: override.amount,
					unit: override.unit,
					approvedTerms: manual
						? [...new Set([override.name, ...(override.selectedName ? [override.selectedName] : [])])]
						: [],
					included: override.included,
					selectedName: override.selectedName,
					bought: override.bought,
					needsReview: !manual,
					createdAt: now,
					updatedAt: now
				})
				.run();
		});
	}
	return report;
}

export function materializePlanningHorizon(
	db: DB,
	options: { currentWeek: string; weekStartDay: number; planAheadWeeks: number }
): MaterializeResult[] {
	return Array.from({ length: options.planAheadWeeks }, (_, index) =>
		materializeShoppingWeek(db, addDays(options.currentWeek, index * 7), {
			weekStartDay: options.weekStartDay,
			today: options.currentWeek
		})
	);
}

/** Idempotent boot transition. The completion marker is written last. */
export function initializeShoppingSourceData(db: DB): {
	dryRun: LegacyImportReport;
	imported: LegacyImportReport;
	alreadyComplete: boolean;
} {
	if (isShoppingSourceMigrationComplete(db)) {
		const empty = emptyLegacyReport();
		return { dryRun: empty, imported: empty, alreadyComplete: true };
	}
	const config = shoppingPlanningConfig(db);
	const dryRun = dryRunLegacyOverrideImport(db);
	materializePlanningHorizon(db, config);
	const imported = importLegacyShoppingOverrides(db);
	if (dryRun.total !== imported.total) {
		throw new Error('Legacy shopping dry-run and import totals differ');
	}
	setHouseholdPref(db, K_SHOPPING_SOURCE_MIGRATION, 'complete');
	return { dryRun, imported, alreadyComplete: false };
}

/** Refresh captured nonpast weeks after a meal, recipe, or source write. */
export function reconcileShoppingAfterWrite(db: DB, affectedWeeks: string[] = []): void {
	if (!isShoppingSourceMigrationComplete(db)) return;
	const config = shoppingPlanningConfig(db);
	const horizonEnd = addDays(config.currentWeek, (config.planAheadWeeks - 1) * 7);
	const capturedWeeks = db
		.selectDistinct({ week: schema.shoppingWeekEntries.weekStartDate })
		.from(schema.shoppingWeekEntries)
		.where(
			and(
				gte(schema.shoppingWeekEntries.weekStartDate, config.currentWeek),
				lte(schema.shoppingWeekEntries.weekStartDate, horizonEnd)
			)
		)
		.all()
		.map((row) => row.week);
	const weeks = [...new Set([...capturedWeeks, ...affectedWeeks.filter((week) => week >= config.currentWeek)])];
	for (const week of weeks) {
		materializeShoppingWeek(db, week, { weekStartDay: config.weekStartDay, today: config.currentWeek });
	}
}
