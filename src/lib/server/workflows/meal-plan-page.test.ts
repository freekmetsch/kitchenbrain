import { afterEach, describe, expect, it, vi } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { loadMealPlanPage } from './meal-plan-page';

afterEach(() => vi.useRealTimers());

describe('meal-plan page rotation shortlist', () => {
	it('loads deterministic Cook and Use freezer rows without AI context', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-03T10:00:00.000Z'));
		const db = createTestDb();
		const now = new Date('2026-08-03T10:00:00.000Z');
		const [due, stocked] = db
			.insert(schema.recipes)
			.values([
				{
					slug: 'bolo',
					title: 'Spaghetti bolognese',
					servings: 4,
					ingredients: [],
					directions: [],
					rotationPolicy: 'weekly',
					lastCookedAt: new Date('2026-07-20T12:00:00.000Z'),
					createdAt: now,
					updatedAt: now
				},
				{
					slug: 'soep',
					title: 'Soup',
					servings: 2,
					ingredients: [],
					directions: [],
					rotationPolicy: 'monthly',
					lastCookedAt: new Date('2026-07-20T12:00:00.000Z'),
					createdAt: now,
					updatedAt: now
				}
			])
			.returning()
			.all();
		db.insert(schema.inventoryItems)
			.values({
				name: 'Soup portions',
				qtyNum: 3,
				section: 'freezer',
				kind: 'leftover',
				madeFromRecipeId: stocked.id,
				createdAt: now,
				updatedAt: now
			})
			.run();

		const result = loadMealPlanPage(new URL('http://localhost/meal-plan'), db);
		const shortlist = result.rotationShortlists[result.currentWeekStart];
		expect(shortlist.due).toContainEqual(
			expect.objectContaining({ id: due.id, action: 'cook', source: 'fresh' })
		);
		expect(result).not.toHaveProperty('freezerPromptSummary');
		expect(result).not.toHaveProperty('recentlyCookedSummary');
	});
});
