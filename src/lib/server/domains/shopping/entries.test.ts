import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type { Ingredient } from '$lib/recipe_ingredient';
import { createTestDb, type TestDb } from '$lib/server/test_db';
import { isShoppingSourceMigrationComplete } from './entries';
import {
	dryRunLegacyOverrideImport,
	initializeShoppingSourceData,
	importLegacyShoppingOverrides,
	materializeShoppingWeek,
	reconcileShoppingAfterWrite
} from '$lib/server/workflows/reconcile-shopping';
import {
	addManualShoppingEntry,
	addRecurringShoppingItem,
	applyRecipeShoppingChoice,
	createShoppingPushAttempt,
	disableRecurringShoppingItem,
	editRecurringShoppingItem,
	recordShoppingPushOutcome,
	resolveLegacyShoppingEntry,
	setRecurringShoppingEntryIncluded,
	updateShoppingEntry
} from './commands';

const CURRENT_WEEK = '2026-07-22';
const WEEK_START_DAY = 2;

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-07-27T12:00:00.000Z'));
});

afterEach(() => {
	vi.useRealTimers();
});

function seedRecipe(
	db: TestDb,
	slug: string,
	ingredients: Ingredient[],
	servings = 4
) {
	const now = new Date('2026-07-22T10:00:00Z');
	return db
		.insert(schema.recipes)
		.values({ slug, title: slug, servings, ingredients, directions: [], createdAt: now, updatedAt: now })
		.returning()
		.get();
}

describe('recipe shopping choices', () => {
	it('updates the active source detail and propagates need to future occurrences', () => {
		const db = createTestDb();
		const now = new Date('2026-07-22T10:00:00Z');
		const rows = db
			.insert(schema.shoppingWeekEntries)
			.values([
				{
					weekStartDate: CURRENT_WEEK,
					sourceKey: 'recipe:1:rice',
					sourceKind: 'recipe',
					name: 'rijst',
					approvedTerms: ['rijst'],
					createdAt: now,
					updatedAt: now
				},
				{
					weekStartDate: '2026-07-29',
					sourceKey: 'recipe:1:rice',
					sourceKind: 'recipe',
					name: 'rijst',
					approvedTerms: ['rijst'],
					createdAt: now,
					updatedAt: now
				}
			])
			.returning()
			.all();

		applyRecipeShoppingChoice(db, {
			entryId: rows[0].id,
			sourceKey: rows[0].sourceKey,
			currentWeek: CURRENT_WEEK,
			name: 'basmatirijst',
			approvedTerms: ['basmatirijst', 'rijst'],
			included: false,
			selectedName: 'basmatirijst'
		});

		expect(
			db.select().from(schema.shoppingWeekEntries).where(eq(schema.shoppingWeekEntries.id, rows[0].id)).get()
		).toMatchObject({
			name: 'basmatirijst',
			approvedTerms: ['basmatirijst', 'rijst'],
			included: false,
			selectedName: 'basmatirijst',
			revision: 2
		});
		expect(
			db.select().from(schema.shoppingWeekEntries).where(eq(schema.shoppingWeekEntries.id, rows[1].id)).get()
		).toMatchObject({ included: false, revision: 2 });
	});
});

describe('AH push persistence', () => {
	it('records the attempt outcome and marks only definite entry ids bought', () => {
		const db = createTestDb();
		const now = new Date('2026-07-22T10:00:00Z');
		const entries = db
			.insert(schema.shoppingWeekEntries)
			.values([
				{
					weekStartDate: CURRENT_WEEK,
					sourceKey: 'manual:1',
					sourceKind: 'manual',
					name: 'rijst',
					approvedTerms: ['rijst'],
					createdAt: now,
					updatedAt: now
				},
				{
					weekStartDate: CURRENT_WEEK,
					sourceKey: 'manual:2',
					sourceKind: 'manual',
					name: 'tomaten',
					approvedTerms: ['tomaten'],
					createdAt: now,
					updatedAt: now
				}
			])
			.returning()
			.all();
		const userId = db.select().from(schema.users).get()!.id;
		const pushId = createShoppingPushAttempt(db, {
			weekStartDate: CURRENT_WEEK,
			userId,
			destination: 'list',
			accountName: 'Test household',
			createdAt: now
		});

		recordShoppingPushOutcome(db, {
			historyId: pushId,
			items: [
				{
					pushId,
					sourceRef: String(entries[0].id),
					sourceName: 'rijst',
					mode: 'product',
					destination: 'list',
					status: 'success',
					createdAt: now
				}
			],
			boughtEntryIds: [entries[0].id],
			productsPushed: 1,
			freetextPushed: 0,
			failedCount: 0,
			skippedCount: 1,
			attemptStatus: 'succeeded',
			attemptError: null,
			completedAt: now
		});

		expect(db.select().from(schema.shoppingPushHistory).get()).toMatchObject({
			id: pushId,
			attemptStatus: 'succeeded',
			productsPushed: 1,
			skippedCount: 1
		});
		expect(db.select().from(schema.shoppingPushItems).all()).toHaveLength(1);
		expect(
			db.select().from(schema.shoppingWeekEntries).where(eq(schema.shoppingWeekEntries.id, entries[0].id)).get()
		).toMatchObject({ bought: true, revision: 2 });
		expect(
			db.select().from(schema.shoppingWeekEntries).where(eq(schema.shoppingWeekEntries.id, entries[1].id)).get()
		).toMatchObject({ bought: false, revision: 1 });
	});
});

function seedMeal(db: TestDb, slug: string, dinner = slug, servings = 4, weekStart = CURRENT_WEEK) {
	return db
		.insert(schema.mealPlanMeals)
		.values({
			weekNumber: 30,
			weekStartDate: weekStart,
			dinner,
			recipeSlug: slug,
			servings,
			sortOrder: 0,
			createdAt: new Date('2026-07-22T10:00:00Z')
		})
		.returning()
		.get();
}

describe('source-owned shopping week entries', () => {
	it('materializes one stable recipe source and preserves state across quantity refreshes', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db, 'curry', [
			{ id: 'rice', name: 'rijst', amount: '400', unit: 'g', substitutes: [{ name: 'basmatirijst' }] }
		]);
		const meal = seedMeal(db, recipe.slug);

		const first = materializeShoppingWeek(db, CURRENT_WEEK, { weekStartDay: WEEK_START_DAY, today: CURRENT_WEEK });
		expect(first).toMatchObject({ status: 'materialized', created: 1 });
		let entry = db.select().from(schema.shoppingWeekEntries).get()!;
		expect(entry).toMatchObject({
			sourceKey: `recipe:${recipe.id}:rice`,
			mealIds: [meal.id],
			amount: '400',
			approvedTerms: ['rijst', 'basmatirijst']
		});

		entry = updateShoppingEntry(db, {
			entryId: entry.id,
			expectedRevision: entry.revision,
			weekStartDay: WEEK_START_DAY,
			selectedName: 'basmatirijst',
			bought: true
		});
		db.update(schema.mealPlanMeals).set({ servings: 8 }).where(eq(schema.mealPlanMeals.id, meal.id)).run();
		materializeShoppingWeek(db, CURRENT_WEEK, { weekStartDay: WEEK_START_DAY, today: CURRENT_WEEK });
		const refreshed = db.select().from(schema.shoppingWeekEntries).get()!;
		expect(refreshed).toMatchObject({ amount: '800', selectedName: 'basmatirijst', bought: false });
	});

	it('preserves a manual amount override and its bought state when planned servings change', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db, 'override-curry', [
			{ id: 'rice', name: 'rijst', amount: '400', unit: 'g' }
		]);
		const meal = seedMeal(db, recipe.slug);
		materializeShoppingWeek(db, CURRENT_WEEK, { weekStartDay: WEEK_START_DAY, today: CURRENT_WEEK });
		const entry = db.select().from(schema.shoppingWeekEntries).get()!;
		db.update(schema.shoppingWeekEntries)
			.set({ amountOverride: '3', unitOverride: 'kg', bought: true })
			.where(eq(schema.shoppingWeekEntries.id, entry.id))
			.run();

		db.update(schema.mealPlanMeals).set({ servings: 8 }).where(eq(schema.mealPlanMeals.id, meal.id)).run();
		materializeShoppingWeek(db, CURRENT_WEEK, { weekStartDay: WEEK_START_DAY, today: CURRENT_WEEK });

		expect(db.select().from(schema.shoppingWeekEntries).get()).toMatchObject({
			amount: '800',
			amountOverride: '3',
			unitOverride: 'kg',
			bought: true
		});
	});

	it('initializes once and reconciles a directly affected meal week after writes', () => {
		const db = createTestDb();
		seedRecipe(db, 'write-path', [{ id: 'write-rice', name: 'rijst', amount: '200', unit: 'g' }], 2);
		const meal = seedMeal(db, 'write-path', 'Write path', 2);
		const first = initializeShoppingSourceData(db);
		expect(first.alreadyComplete).toBe(false);
		expect(isShoppingSourceMigrationComplete(db)).toBe(true);
		expect(initializeShoppingSourceData(db).alreadyComplete).toBe(true);

		db.update(schema.mealPlanMeals).set({ servings: 4 }).where(eq(schema.mealPlanMeals.id, meal.id)).run();
		reconcileShoppingAfterWrite(db, [CURRENT_WEEK]);
		expect(db.select().from(schema.shoppingWeekEntries).get()?.amount).toBe('400');

		db.delete(schema.mealPlanMeals).where(eq(schema.mealPlanMeals.id, meal.id)).run();
		reconcileShoppingAfterWrite(db, [CURRENT_WEEK]);
		expect(db.select().from(schema.shoppingWeekEntries).get()?.retiredAt).toBeInstanceOf(Date);
	});

	it('keeps equal ingredients in separate component sources while the final need sums them', () => {
		const db = createTestDb();
		seedRecipe(db, 'taart', [
			{ id: 'crust-butter', name: 'boter', amount: '250', unit: 'g', component: 'Korst' },
			{ id: 'sauce-butter', name: 'boter', amount: '250', unit: 'g', component: 'Saus' }
		]);
		seedMeal(db, 'taart');

		materializeShoppingWeek(db, CURRENT_WEEK, { weekStartDay: WEEK_START_DAY, today: CURRENT_WEEK });
		const entries = db.select().from(schema.shoppingWeekEntries).all();
		expect(entries.map((entry) => [entry.ingredientId, entry.component, entry.amount])).toEqual([
			['crust-butter', 'Korst', '250'],
			['sauce-butter', 'Saus', '250']
		]);
	});

	it('retires a removed recipe source without deleting its captured state', () => {
		const db = createTestDb();
		seedRecipe(db, 'soup', [{ id: 'onion', name: 'ui', amount: '1' }]);
		const meal = seedMeal(db, 'soup');
		materializeShoppingWeek(db, CURRENT_WEEK, { weekStartDay: WEEK_START_DAY, today: CURRENT_WEEK });
		db.delete(schema.mealPlanMeals).where(eq(schema.mealPlanMeals.id, meal.id)).run();

		const result = materializeShoppingWeek(db, CURRENT_WEEK, { weekStartDay: WEEK_START_DAY, today: CURRENT_WEEK });
		expect(result.retired).toBe(1);
		expect(db.select().from(schema.shoppingWeekEntries).get()?.retiredAt).toBeInstanceOf(Date);
	});

	it('does not reconstruct a past week that was never captured', () => {
		const db = createTestDb();
		seedRecipe(db, 'old', [{ id: 'old-onion', name: 'ui', amount: '1' }]);
		seedMeal(db, 'old', 'Old meal', 4, '2026-07-15');

		expect(
			materializeShoppingWeek(db, '2026-07-15', { weekStartDay: WEEK_START_DAY, today: CURRENT_WEEK })
		).toEqual({ status: 'history_not_captured', created: 0, updated: 0, retired: 0 });
	});

	it('never reconciles a captured past snapshot from current recipe data', () => {
		const db = createTestDb();
		const recipe = seedRecipe(db, 'captured', [{ id: 'captured-onion', name: 'ui', amount: '1' }]);
		seedMeal(db, recipe.slug, 'Captured meal', 4, '2026-07-15');
		materializeShoppingWeek(db, '2026-07-15', {
			weekStartDay: WEEK_START_DAY,
			today: CURRENT_WEEK,
			allowPastForMigration: true
		});
		db.update(schema.recipes)
			.set({ ingredients: [{ id: 'captured-onion', name: 'ui', amount: '9' }] })
			.where(eq(schema.recipes.id, recipe.id))
			.run();

		expect(
			materializeShoppingWeek(db, '2026-07-15', { weekStartDay: WEEK_START_DAY, today: CURRENT_WEEK })
		).toEqual({ status: 'existing', created: 0, updated: 0, retired: 0 });
		expect(db.select().from(schema.shoppingWeekEntries).get()?.amount).toBe('1');
	});

	it('uses effective-dated recurring edits and one-week skips', () => {
		const db = createTestDb();
		const milk = addRecurringShoppingItem(db, {
			name: 'melk',
			amount: '2',
			unit: 'pak',
			startWeek: CURRENT_WEEK,
			weekStartDay: WEEK_START_DAY
		});
		materializeShoppingWeek(db, CURRENT_WEEK, { weekStartDay: WEEK_START_DAY, today: CURRENT_WEEK });
		const occurrence = db.select().from(schema.shoppingWeekEntries).get()!;
		const skipped = setRecurringShoppingEntryIncluded(db, {
			entryId: occurrence.id,
			expectedRevision: occurrence.revision,
			weekStartDay: WEEK_START_DAY,
			included: false
		});
		const restored = setRecurringShoppingEntryIncluded(db, {
			entryId: skipped.id,
			expectedRevision: skipped.revision,
			weekStartDay: WEEK_START_DAY,
			included: true
		});
		setRecurringShoppingEntryIncluded(db, {
			entryId: restored.id,
			expectedRevision: restored.revision,
			weekStartDay: WEEK_START_DAY,
			included: false
		});

		const successor = editRecurringShoppingItem(db, {
			id: milk.id,
			expectedRevision: milk.revision,
			effectiveWeek: '2026-07-29',
			weekStartDay: WEEK_START_DAY,
			name: 'halfvolle melk',
			amount: '2',
			unit: 'pak'
		});
		expect(successor.startWeek).toBe('2026-07-29');
		expect(successor.id).not.toBe(milk.id);
		expect(db.select().from(schema.recurringShoppingItems).where(eq(schema.recurringShoppingItems.id, milk.id)).get()?.endWeek).toBe(CURRENT_WEEK);
		expect(db.select().from(schema.shoppingWeekEntries).get()?.included).toBe(false);

		disableRecurringShoppingItem(db, {
			id: successor.id,
			expectedRevision: successor.revision,
			effectiveWeek: '2026-08-05',
			weekStartDay: WEEK_START_DAY
		});
		expect(
			db
				.select()
				.from(schema.recurringShoppingItems)
				.where(eq(schema.recurringShoppingItems.id, successor.id))
				.get()?.endWeek
		).toBe('2026-07-29');
	});

	it('fails closed for stale and past weekly occurrence changes', () => {
		const db = createTestDb();
		addRecurringShoppingItem(db, {
			name: 'melk',
			startWeek: CURRENT_WEEK,
			weekStartDay: WEEK_START_DAY
		});
		materializeShoppingWeek(db, CURRENT_WEEK, {
			weekStartDay: WEEK_START_DAY,
			today: CURRENT_WEEK
		});
		const occurrence = db.select().from(schema.shoppingWeekEntries).get()!;
		expect(() =>
			setRecurringShoppingEntryIncluded(db, {
				entryId: occurrence.id,
				expectedRevision: occurrence.revision + 1,
				weekStartDay: WEEK_START_DAY,
				included: false
			})
		).toThrow('Weekly occurrence changed');

		db.update(schema.shoppingWeekEntries)
			.set({ weekStartDate: '2026-07-15' })
			.where(eq(schema.shoppingWeekEntries.id, occurrence.id))
			.run();
		expect(() =>
			setRecurringShoppingEntryIncluded(db, {
				entryId: occurrence.id,
				expectedRevision: occurrence.revision,
				weekStartDay: WEEK_START_DAY,
				included: false
			})
		).toThrow('past shopping weeks');
	});

	it('rejects overlapping active recurring ranges', () => {
		const db = createTestDb();
		addRecurringShoppingItem(db, {
			name: 'yoghurt',
			startWeek: CURRENT_WEEK,
			weekStartDay: WEEK_START_DAY
		});
		expect(() =>
			addRecurringShoppingItem(db, {
				name: ' YOGHURT ',
				startWeek: '2026-07-29',
				weekStartDay: WEEK_START_DAY
			})
		).toThrow('Recurring shopping item ranges overlap');
	});

	it('imports manual, exact, unmatched, and ambiguous legacy rows without guessing', () => {
		const db = createTestDb();
		seedRecipe(db, 'exact', [{ id: 'exact-rice', name: 'rijst', amount: '200', substitutes: [{ name: 'basmatirijst' }] }]);
		seedMeal(db, 'exact');
		seedRecipe(db, 'amb-a', [{ id: 'amb-a-rice', name: 'tomaat', amount: '1' }]);
		seedRecipe(db, 'amb-b', [{ id: 'amb-b-rice', name: 'tomaat', amount: '2' }]);
		seedMeal(db, 'amb-a');
		seedMeal(db, 'amb-b');
		const now = new Date();
		db.insert(schema.shoppingListOverrides).values([
			{ weekStartDate: CURRENT_WEEK, name: 'brood', manual: true, bought: true, createdAt: now },
			{
				weekStartDate: CURRENT_WEEK,
				name: 'rijst',
				amount: '3',
				unit: 'kg',
				selectedName: 'basmatirijst',
				bought: false,
				createdAt: now
			},
			{ weekStartDate: CURRENT_WEEK, name: 'citroenen', selectedName: 'limoenen', bought: false, createdAt: now },
			{ weekStartDate: CURRENT_WEEK, name: 'tomaat', bought: false, createdAt: now },
			{ weekStartDate: CURRENT_WEEK, name: ' RIJST ', bought: false, createdAt: now }
		]).run();

		expect(dryRunLegacyOverrideImport(db)).toMatchObject({
			total: 5,
			manual: 1,
			exact: 1,
			unmatched: 1,
			ambiguous: 2
		});
		const committed = importLegacyShoppingOverrides(db);
		expect(committed).toMatchObject({ total: 5, manual: 1, exact: 1, unmatched: 1, ambiguous: 2 });
		const entries = db.select().from(schema.shoppingWeekEntries).all();
		expect(entries.filter((entry) => entry.legacyOverrideId != null)).toHaveLength(5);
		expect(entries.find((entry) => entry.sourceKey.startsWith('legacy:') && entry.name === 'citroenen')).toMatchObject({
			selectedName: 'limoenen',
			needsReview: true,
			approvedTerms: []
		});
		expect(entries.find((entry) => entry.sourceKey.includes('exact-rice'))).toMatchObject({
			amountOverride: '3',
			unitOverride: 'kg'
		});
		expect(importLegacyShoppingOverrides(db).alreadyImported).toBe(5);
	});

	it('resolves a legacy row once and keeps the audit row', () => {
		const db = createTestDb();
		const legacy = db
			.insert(schema.shoppingWeekEntries)
			.values({
				weekStartDate: CURRENT_WEEK,
				sourceKey: 'legacy:7',
				sourceKind: 'legacy',
				name: 'bloem',
				amount: '1',
				unit: 'kg',
				needsReview: true,
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.returning()
			.get();
		expect(() =>
			updateShoppingEntry(db, {
				entryId: legacy.id,
				expectedRevision: legacy.revision,
				weekStartDay: WEEK_START_DAY,
				bought: true
			})
		).toThrow('Resolve this legacy shopping item');
		expect(
			db.select().from(schema.shoppingWeekEntries).where(eq(schema.shoppingWeekEntries.id, legacy.id)).get()?.bought
		).toBe(false);

		const resolved = resolveLegacyShoppingEntry(db, {
			legacyEntryId: legacy.id,
			expectedLegacyRevision: legacy.revision,
			action: 'manual',
			weekStartDay: WEEK_START_DAY
		});
		expect(resolved).toMatchObject({ resolution: 'manual', needsReview: false });
		expect(db.select().from(schema.shoppingWeekEntries).all()).toHaveLength(2);
		expect(() =>
			resolveLegacyShoppingEntry(db, {
				legacyEntryId: legacy.id,
				expectedLegacyRevision: legacy.revision,
				action: 'dismiss',
				weekStartDay: WEEK_START_DAY
			})
		).toThrow('already resolved');
	});

	it('dismisses an unresolved past legacy row without reopening captured shopping state', () => {
		const db = createTestDb();
		const now = new Date();
		const legacy = db.insert(schema.shoppingWeekEntries).values({
			weekStartDate: '2026-07-15',
			sourceKey: 'legacy:past',
			sourceKind: 'legacy',
			name: 'snoeptomaatjes',
			needsReview: true,
			createdAt: now,
			updatedAt: now
		}).returning().get();

		const dismissed = resolveLegacyShoppingEntry(db, {
			legacyEntryId: legacy.id,
			expectedLegacyRevision: legacy.revision,
			action: 'dismiss',
			weekStartDay: WEEK_START_DAY
		});

		expect(dismissed).toMatchObject({
			resolution: 'dismissed',
			needsReview: false,
			resolvedSourceKey: null
		});
		expect(dismissed.resolvedAt).toBeInstanceOf(Date);
		expect(dismissed.retiredAt).toBeInstanceOf(Date);
	});

	it('attaches legacy state only to a fresh server-derived candidate', () => {
		const db = createTestDb();
		const now = new Date();
		const target = db.insert(schema.shoppingWeekEntries).values({
			weekStartDate: CURRENT_WEEK, sourceKey: 'manual:1', sourceKind: 'manual',
			name: 'bloem', approvedTerms: ['bloem'], createdAt: now, updatedAt: now
		}).returning().get();
		const wrong = db.insert(schema.shoppingWeekEntries).values({
			weekStartDate: CURRENT_WEEK, sourceKey: 'manual:2', sourceKind: 'manual',
			name: 'melk', approvedTerms: ['melk'], createdAt: now, updatedAt: now
		}).returning().get();
		const legacy = db.insert(schema.shoppingWeekEntries).values({
			weekStartDate: CURRENT_WEEK, sourceKey: 'legacy:8', sourceKind: 'legacy',
			name: 'bloem', approvedTerms: [], needsReview: true, bought: true,
			createdAt: now, updatedAt: now
		}).returning().get();

		expect(() => resolveLegacyShoppingEntry(db, {
			legacyEntryId: legacy.id, expectedLegacyRevision: legacy.revision,
			action: 'attach', targetEntryId: wrong.id, expectedTargetRevision: wrong.revision,
			weekStartDay: WEEK_START_DAY
		})).toThrow('active source');
		expect(() => resolveLegacyShoppingEntry(db, {
			legacyEntryId: legacy.id, expectedLegacyRevision: legacy.revision,
			action: 'attach', targetEntryId: target.id, expectedTargetRevision: target.revision + 1,
			weekStartDay: WEEK_START_DAY
		})).toThrow('changed');

		resolveLegacyShoppingEntry(db, {
			legacyEntryId: legacy.id, expectedLegacyRevision: legacy.revision,
			action: 'attach', targetEntryId: target.id, expectedTargetRevision: target.revision,
			weekStartDay: WEEK_START_DAY
		});
		expect(db.select().from(schema.shoppingWeekEntries).where(eq(schema.shoppingWeekEntries.id, target.id)).get()).toMatchObject({ bought: true });
	});

	it('keeps manual IDs stable and can disable an uncaptured recurring item without history', () => {
		const db = createTestDb();
		const manual = addManualShoppingEntry(db, {
			weekStart: CURRENT_WEEK,
			weekStartDay: WEEK_START_DAY,
			name: 'fruit'
		});
		expect(manual.sourceKey).toBe(`manual:${manual.id}`);
		const weekly = addRecurringShoppingItem(db, {
			name: 'kwark',
			startWeek: CURRENT_WEEK,
			weekStartDay: WEEK_START_DAY
		});
		disableRecurringShoppingItem(db, {
			id: weekly.id,
			expectedRevision: weekly.revision,
			effectiveWeek: CURRENT_WEEK,
			weekStartDay: WEEK_START_DAY
		});
		expect(db.select().from(schema.recurringShoppingItems).where(eq(schema.recurringShoppingItems.id, weekly.id)).get()).toBeUndefined();
	});
});
