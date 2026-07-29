import { describe, expect, it } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { executeToolCall } from './index';

describe('prepare_cooking_action executor', () => {
	it('stages a valid timer and rejects incomplete timer details', async () => {
		const db = createTestDb();

		await expect(
			executeToolCall(
				'prepare_cooking_action',
				{ action: 'timer', timer_operation: 'start', seconds: 600, label: 'Pasta' },
				db,
				1
			)
		).resolves.toMatchObject({
			ok: true,
			kind: 'cooking_action',
			actionKind: 'timer'
		});
		await expect(
			executeToolCall(
				'prepare_cooking_action',
				{ action: 'timer', timer_operation: 'start', label: 'Pasta' },
				db,
				1
			)
		).resolves.toMatchObject({
			ok: false,
			contract_error: 'invalid_input'
		});
	});

	it('grounds rescue and defrost reviews in saved state without writing', async () => {
		const db = createTestDb();
		const now = new Date('2026-07-29T10:00:00Z');
		db.insert(schema.recipes)
			.values({
				slug: 'soep',
				title: 'Soep',
				ingredients: [{ id: 'salt', name: 'zout', amount: '1' }],
				directions: ['Laat inkoken.'],
				createdAt: now,
				updatedAt: now
			})
			.run();
		const item = db
			.insert(schema.inventoryItems)
			.values({
				name: 'Soep',
				section: 'freezer',
				qtyNum: 2,
				unit: 'portion',
				createdAt: now,
				updatedAt: now
			})
			.returning()
			.get();

		await expect(
			executeToolCall(
				'prepare_cooking_action',
				{ action: 'rescue', recipe_slug: 'soep', issue: 'too_thin', step_index: 0 },
				db,
				1
			)
		).resolves.toMatchObject({
			ok: true,
			actionKind: 'rescue',
			rescue: { recipeSlug: 'soep', stepIndex: 0 }
		});
		await expect(
			executeToolCall(
				'prepare_cooking_action',
				{ action: 'defrost', inventory_id: item.id },
				db,
				1
			)
		).resolves.toMatchObject({
			ok: true,
			actionKind: 'defrost',
			defrost: { itemId: item.id }
		});
		expect(db.select().from(schema.inventoryOpsLog).all()).toHaveLength(0);
	});
});
