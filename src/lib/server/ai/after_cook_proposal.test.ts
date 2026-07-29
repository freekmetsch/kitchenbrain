import { beforeEach, describe, expect, it } from 'vitest';
import { eq, isNull } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import {
	applyAfterCookProposal,
	clearAfterCookProposalsForTest,
	stageAfterCookProposal,
	undoAfterCookProposal
} from './after_cook_proposal';

function setup() {
	const db = createTestDb();
	const now = new Date('2026-07-29T10:00:00Z');
	const recipe = db
		.insert(schema.recipes)
		.values({
			slug: 'hachee',
			title: 'Hachee',
			servings: 3,
			ingredients: [],
			directions: [],
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();
	const meal = db
		.insert(schema.mealPlanMeals)
		.values({
			weekNumber: 31,
			weekStartDate: '2026-07-29',
			dinner: 'Hachee',
			recipeSlug: recipe.slug,
			servings: 3,
			source: 'freezer',
			status: 'planned',
			createdAt: now
		})
		.returning()
		.get();
	const leftovers = db
		.insert(schema.inventoryItems)
		.values([
			{
				name: 'Hachee oldest',
				section: 'freezer',
				kind: 'leftover',
				qtyNum: 2,
				unit: 'portion',
				madeFromRecipeId: recipe.id,
				recipeStatus: 'linked',
				createdAt: new Date('2026-07-01T10:00:00Z'),
				updatedAt: new Date('2026-07-01T10:00:00Z')
			},
			{
				name: 'Hachee newest',
				section: 'freezer',
				kind: 'leftover',
				qtyNum: 3,
				unit: 'portion',
				madeFromRecipeId: recipe.id,
				recipeStatus: 'linked',
				createdAt: new Date('2026-07-15T10:00:00Z'),
				updatedAt: new Date('2026-07-15T10:00:00Z')
			}
		])
		.returning()
		.all();
	return { db, meal, leftovers };
}

describe('after-cook proposal', () => {
	beforeEach(() => clearAfterCookProposalsForTest());

	it('stages no writes, then atomically checks out oldest stock and undoes the bundle', () => {
		const { db, meal, leftovers } = setup();
		const proposal = stageAfterCookProposal(
			db,
			{ userId: 1, mealId: meal.id, cookedDate: '2026-07-29' },
			Date.parse('2026-07-29T10:00:00Z')
		);

		expect(proposal).toMatchObject({
			status: 'active',
			availablePortions: 5,
			defaultEatenPortions: 3,
			atomicity: { kind: 'atomic' }
		});
		expect(
			db.select().from(schema.mealPlanMeals).where(eq(schema.mealPlanMeals.id, meal.id)).get()
		).toMatchObject({ status: 'planned', cookedDate: null });
		expect(db.select().from(schema.inventoryOpsLog).all()).toHaveLength(0);

		const applied = applyAfterCookProposal(
			db,
			{ token: proposal.token, userId: 1, eatenPortions: 3 },
			Date.parse('2026-07-29T10:01:00Z')
		);
		expect(applied).toMatchObject({
			receipt: {
				status: 'committed',
				atomicity: 'atomic',
				eatenPortions: 3,
				remainingPortions: 2
			}
		});
		expect(
			db.select().from(schema.mealPlanMeals).where(eq(schema.mealPlanMeals.id, meal.id)).get()
		).toMatchObject({ status: 'cooked', cookedDate: '2026-07-29' });
		expect(
			db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, leftovers[0].id)).get()
				?.deletedAt
		).toBeInstanceOf(Date);
		expect(
			db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, leftovers[1].id)).get()
		).toMatchObject({ qtyNum: 2, deletedAt: null });
		expect(db.select().from(schema.cookLog).all()).toHaveLength(1);

		expect(
			undoAfterCookProposal(db, { token: proposal.token, userId: 1 })
		).toMatchObject({
			receipt: { status: 'undone', atomicity: 'atomic', restoredPortions: 3 }
		});
		expect(
			db.select().from(schema.mealPlanMeals).where(eq(schema.mealPlanMeals.id, meal.id)).get()
		).toMatchObject({ status: 'planned', cookedDate: null });
		expect(
			db.select().from(schema.inventoryItems).where(isNull(schema.inventoryItems.deletedAt)).all()
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: leftovers[0].id, qtyNum: 2 }),
				expect.objectContaining({ id: leftovers[1].id, qtyNum: 3 })
			])
		);
		expect(db.select().from(schema.cookLog).all()).toHaveLength(0);
	});

	it('refuses a stale stock checkout without marking the meal cooked', () => {
		const { db, meal, leftovers } = setup();
		const proposal = stageAfterCookProposal(db, { userId: 1, mealId: meal.id });
		db.update(schema.inventoryItems)
			.set({ qtyNum: 1, updatedAt: new Date('2026-07-29T11:00:00Z') })
			.where(eq(schema.inventoryItems.id, leftovers[0].id))
			.run();

		expect(() =>
			applyAfterCookProposal(db, {
				token: proposal.token,
				userId: 1,
				eatenPortions: 2
			})
		).toThrow(/stock changed/i);
		expect(
			db.select().from(schema.mealPlanMeals).where(eq(schema.mealPlanMeals.id, meal.id)).get()
		).toMatchObject({ status: 'planned' });
		expect(db.select().from(schema.cookLog).all()).toHaveLength(0);
	});
});
