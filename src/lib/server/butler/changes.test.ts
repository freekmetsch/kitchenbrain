import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { addInventory } from '$lib/server/workflows/inventory';
import { getProvableHouseholdChanges } from './changes';

describe('provable Butler household changes', () => {
	it('reports only changes with truthful actor provenance after the explicit marker', () => {
		const db = createTestDb();
		const user = db.select().from(schema.users).get()!;
		const since = new Date('2026-07-28T09:00:00Z');
		const now = new Date('2026-07-30T10:00:00Z');
		addInventory(
			db,
			{ name: 'Spinazie', section: 'pantry' },
			{ userId: user.id, actor: user.username }
		);
		db.insert(schema.shoppingPushHistory)
			.values({
				weekStartDate: '2026-07-29',
				userId: user.id,
				destination: 'list',
				accountName: 'Test household',
				productsPushed: 2,
				attemptStatus: 'succeeded',
				completedAt: new Date('2026-07-29T09:45:00Z'),
				createdAt: new Date('2026-07-29T09:44:00Z')
			})
			.run();
		db.insert(schema.mealPlanMeals)
			.values({
				weekNumber: 31,
				weekStartDate: '2026-07-29',
				dinner: 'Unattributed meal',
				createdAt: new Date('2026-07-29T09:30:00Z')
			})
			.run();

		const summary = getProvableHouseholdChanges(db, { since, through: now });

		expect(summary.events).toEqual([
			expect.objectContaining({
				domain: 'shopping',
				actor: 'Testuser',
				subject: 'Shopping'
			}),
			expect.objectContaining({
				domain: 'stock',
				actor: 'Testuser',
				subject: 'Spinazie'
			})
		]);
		expect(summary.limitations).toContain(
			'Meal-plan and recipe edits are omitted until those writers carry actor provenance.'
		);
	});

	it('returns no inferred history before a marker is explicitly saved', () => {
		const db = createTestDb();
		const before = db.get<{ total: number }>(sql`select total_changes() as total`)!.total;
		expect(
			getProvableHouseholdChanges(db, {
				since: null,
				through: new Date('2026-07-29T10:00:00Z')
			}).events
		).toEqual([]);
		const after = db.get<{ total: number }>(sql`select total_changes() as total`)!.total;
		expect(after).toBe(before);
	});
});
