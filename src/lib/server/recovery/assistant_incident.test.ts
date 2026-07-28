import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb, type TestDb } from '$lib/server/test_db';
import { addInventory, updateInventory } from '$lib/server/workflows/inventory';
import {
	applyAssistantIncidentRecovery,
	inspectAssistantIncidentRecovery
} from './assistant_incident';

const CTX = { actor: 'ai' as const, userId: 1 };

function seedIncident(db: TestDb) {
	const first = addInventory(
		db,
		{ name: 'Kip', section: 'freezer', qtyNum: 2, unit: 'stuk' },
		CTX
	);
	const second = addInventory(
		db,
		{ name: 'Bonen', section: 'pantry', qtyNum: 1, unit: 'blik' },
		CTX
	);
	const firstIncident = updateInventory(db, first.item.id, { qtyNum: 99 }, CTX);
	const secondIncident = updateInventory(db, second.item.id, { qtyNum: 88 }, CTX);
	if (!firstIncident.ok || !secondIncident.ok) throw new Error('fixture update failed');

	const recipe = db
		.insert(schema.recipes)
		.values({
			slug: 'stoofpot',
			title: 'Stoofpot',
			notes: 'Oorspronkelijke notitie',
			ingredients: [],
			directions: ['Koken'],
			createdAt: new Date(),
			updatedAt: new Date()
		})
		.returning()
		.get();
	db.update(schema.recipes)
		.set({
			notes: 'FIXES NEEDED',
			contentRevision: recipe.contentRevision + 1,
			translationStatus: 'pending',
			updatedAt: new Date()
		})
		.where(eq(schema.recipes.id, recipe.id))
		.run();
	const inventoryMessage = db
		.insert(schema.chatMessages)
		.values({
			userId: 1,
			role: 'assistant',
			content: 'Voorraad aangepast',
			toolCalls: [
				{
					name: 'update_inventory_item',
					input: { id: first.item.id, qty_num: 99 },
					result: { ok: true, opId: firstIncident.opId }
				},
				{
					name: 'update_inventory_item',
					input: { id: second.item.id, qty_num: 88 },
					result: { ok: true, opId: secondIncident.opId }
				}
			],
			createdAt: new Date()
		})
		.returning()
		.get();
	const recipeMessage = db
		.insert(schema.chatMessages)
		.values({
			userId: 1,
			role: 'assistant',
			content: 'Recept aangepast',
			toolCalls: [
				{
					name: 'get_recipe',
					input: { slug: recipe.slug },
					result: { found: true, recipe }
				},
				{
					name: 'edit_recipe',
					input: { slug: recipe.slug, notes: 'FIXES NEEDED' },
					result: { ok: true, slug: recipe.slug }
				}
			],
			createdAt: new Date()
		})
		.returning()
		.get();
	return {
		operationIds: [firstIncident.opId!, secondIncident.opId!],
		inventoryMessageId: inventoryMessage.id,
		recipeMessageId: recipeMessage.id,
		firstId: first.item.id,
		secondId: second.item.id,
		recipeId: recipe.id
	};
}

function inventoryQty(db: TestDb, id: number) {
	return db
		.select({ qtyNum: schema.inventoryItems.qtyNum })
		.from(schema.inventoryItems)
		.where(eq(schema.inventoryItems.id, id))
		.get()?.qtyNum;
}

describe('assistant incident recovery', () => {
	it('dry-runs and atomically restores the exact operation snapshots and recipe note', () => {
		const db = createTestDb();
		const fixture = seedIncident(db);
		const beforeOps = db.select().from(schema.inventoryOpsLog).all().length;

		const inspection = inspectAssistantIncidentRecovery(db, fixture);
		expect(inspection.ready).toBe(true);
		expect(inspection.inventory).toHaveLength(2);
		expect(inventoryQty(db, fixture.firstId)).toBe(99);
		expect(db.select().from(schema.inventoryOpsLog).all()).toHaveLength(beforeOps);

		const result = applyAssistantIncidentRecovery(db, fixture);
		expect(result.compensatingOperationIds).toHaveLength(2);
		expect(result.postApply).toMatchObject({
			inventoryRestored: true,
			recipeRestored: true,
			unrelatedUnchanged: true,
			counts: {
				inventoryItems: result.counts.inventoryItems,
				inventoryOps: result.counts.inventoryOps + 2,
				recipes: result.counts.recipes
			}
		});
		expect(inventoryQty(db, fixture.firstId)).toBe(2);
		expect(inventoryQty(db, fixture.secondId)).toBe(1);
		expect(
			db
				.select()
				.from(schema.recipes)
				.where(eq(schema.recipes.id, fixture.recipeId))
				.get()
		).toMatchObject({
			notes: 'Oorspronkelijke notitie',
			contentRevision: 3,
			translationStatus: 'pending'
		});
		expect(db.select().from(schema.inventoryOpsLog).all()).toHaveLength(beforeOps + 2);
	});

	it('changes nothing when any inventory precondition has drifted', () => {
		const db = createTestDb();
		const fixture = seedIncident(db);
		db.update(schema.inventoryItems)
			.set({ qtyNum: 77, updatedAt: new Date() })
			.where(eq(schema.inventoryItems.id, fixture.secondId))
			.run();
		const beforeOps = db.select().from(schema.inventoryOpsLog).all().length;

		const inspection = inspectAssistantIncidentRecovery(db, fixture);
		expect(inspection.ready).toBe(false);
		expect(() => applyAssistantIncidentRecovery(db, fixture)).toThrow(
			'preconditions failed'
		);
		expect(inventoryQty(db, fixture.firstId)).toBe(99);
		expect(inventoryQty(db, fixture.secondId)).toBe(77);
		expect(db.select().from(schema.inventoryOpsLog).all()).toHaveLength(beforeOps);
	});

	it('refuses a recipe edit that changed fields beyond notes', () => {
		const db = createTestDb();
		const fixture = seedIncident(db);
		const message = db
			.select()
			.from(schema.chatMessages)
			.where(eq(schema.chatMessages.id, fixture.recipeMessageId))
			.get()!;
		const toolCalls = message.toolCalls as Array<Record<string, unknown>>;
		toolCalls[1] = {
			...toolCalls[1],
			input: { slug: 'stoofpot', notes: 'FIXES NEEDED', servings: 8 }
		};
		db.update(schema.chatMessages)
			.set({ toolCalls })
			.where(eq(schema.chatMessages.id, fixture.recipeMessageId))
			.run();

		expect(() => inspectAssistantIncidentRecovery(db, fixture)).toThrow('beyond notes');
	});

	it('refuses operation IDs that are not exactly recorded on the incident message', () => {
		const db = createTestDb();
		const fixture = seedIncident(db);
		const unrelated = addInventory(
			db,
			{ name: 'Rijst', section: 'pantry', qtyNum: 1, unit: 'zak' },
			CTX
		);
		const unrelatedUpdate = updateInventory(
			db,
			unrelated.item.id,
			{ qtyNum: 2 },
			CTX
		);
		if (!unrelatedUpdate.ok) throw new Error('fixture update failed');

		expect(() =>
			inspectAssistantIncidentRecovery(db, {
				...fixture,
				operationIds: [...fixture.operationIds, unrelatedUpdate.opId!]
			})
		).toThrow('do not exactly match');
	});
});
