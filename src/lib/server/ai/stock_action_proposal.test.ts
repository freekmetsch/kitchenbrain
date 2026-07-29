import { describe, expect, it } from 'vitest';
import { eq, isNull } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import {
	applyStockActionProposal,
	stageStockActionProposal,
	undoStockActionProposal
} from './stock_action_proposal';

const recommendationInput = {
	title: 'Restock rice',
	reason: 'The household said the last rice was used.'
};

describe('reviewed stock and Shopping proposals', () => {
	it('stages an out-of-stock bundle without writing, then applies it atomically', () => {
		const db = createTestDb();
		const rice = db
			.insert(schema.inventoryItems)
			.values({
				name: 'Rijst',
				section: 'pantry',
				qtyNum: 1,
				unit: 'pak',
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.returning()
			.get();

		const proposal = stageStockActionProposal(db, {
			userId: 1,
			...recommendationInput,
			operations: [
				{
					kind: 'stock_replace',
					itemId: rice.id,
					replacementName: 'Rijst',
					amount: '1',
					unit: 'pak',
					reason: 'No rice remains.'
				}
			]
		});

		expect(proposal).toMatchObject({
			status: 'active',
			atomicity: { kind: 'atomic' },
			recommendation: {
				confidence: 'high',
				uncertainty: null
			}
		});
		expect(proposal.operations).toHaveLength(1);
		expect(db.select().from(schema.inventoryItems).get()).toMatchObject({ qtyNum: 1 });
		expect(db.select().from(schema.shoppingWeekEntries).all()).toEqual([]);

		const receipt = applyStockActionProposal(db, {
			token: proposal.token,
			userId: 1,
			operationIds: proposal.operations.map((operation) => operation.id)
		});
		expect(receipt).toMatchObject({
			status: 'committed',
			atomicity: 'atomic',
			inventoryChanges: 1,
			shoppingChanges: 1
		});
		expect(db.select().from(schema.inventoryItems).get()).toMatchObject({ qtyNum: 0 });
		expect(db.select().from(schema.shoppingWeekEntries).get()).toMatchObject({
			name: 'Rijst',
			sourceKind: 'manual',
			amount: '1',
			unit: 'pak'
		});
	});

	it('reuses an authoritative Shopping source instead of adding a duplicate replacement', () => {
		const db = createTestDb();
		const rice = db
			.insert(schema.inventoryItems)
			.values({
				name: 'Rijst',
				section: 'pantry',
				qtyNum: 1,
				unit: 'pak',
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.returning()
			.get();
		const existing = db
			.insert(schema.shoppingWeekEntries)
			.values({
				weekStartDate: '2026-07-29',
				sourceKey: 'manual:existing-rice',
				sourceKind: 'manual',
				name: 'Rijst',
				approvedTerms: ['Rijst'],
				bought: true,
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.returning()
			.get();

		const proposal = stageStockActionProposal(
			db,
			{
				userId: 1,
				...recommendationInput,
				operations: [
					{
						kind: 'stock_replace',
						itemId: rice.id,
						replacementName: 'Rijst',
						reason: 'No rice remains.'
					}
				]
			},
			new Date('2026-07-29T10:00:00Z')
		);
		expect(proposal.operations[0].after).toMatch(/existing Shopping source/i);

		const receipt = applyStockActionProposal(db, {
			token: proposal.token,
			userId: 1,
			operationIds: proposal.operations.map((operation) => operation.id)
		}, new Date('2026-07-29T10:01:00Z').getTime());
		expect(receipt).toMatchObject({ inventoryChanges: 1, shoppingChanges: 1 });
		expect(db.select().from(schema.shoppingWeekEntries).all()).toHaveLength(1);
		expect(
			db.select().from(schema.shoppingWeekEntries).where(eq(schema.shoppingWeekEntries.id, existing.id)).get()
		).toMatchObject({ included: true, bought: false });
	});

	it('rolls the whole bundle back when a later Shopping operation fails', () => {
		const db = createTestDb();
		const rice = db
			.insert(schema.inventoryItems)
			.values({
				name: 'Rijst',
				section: 'pantry',
				qtyNum: 1,
				unit: 'pak',
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.returning()
			.get();
		const proposal = stageStockActionProposal(db, {
			userId: 1,
			...recommendationInput,
			operations: [
				{
					kind: 'stock_replace',
					itemId: rice.id,
					replacementName: 'Rijst',
					reason: 'No rice remains.'
				}
			]
		});
		db.run(`CREATE TRIGGER fail_manual_shopping
			BEFORE INSERT ON shopping_week_entries
			BEGIN SELECT RAISE(ABORT, 'injected shopping failure'); END;`);

		expect(() =>
			applyStockActionProposal(db, {
				token: proposal.token,
				userId: 1,
				operationIds: proposal.operations.map((operation) => operation.id)
			})
		).toThrow('injected shopping failure');
		expect(db.select().from(schema.inventoryItems).get()).toMatchObject({ qtyNum: 1 });
		expect(db.select().from(schema.inventoryOpsLog).all()).toEqual([]);
	});

	it('prepares exact pantry deficits and excludes unknown quantities', () => {
		const db = createTestDb();
		const [rice, oil] = db
			.insert(schema.inventoryItems)
			.values([
				{
					name: 'Rijst',
					section: 'pantry',
					qtyNum: 1,
					unit: 'pak',
					parTargetQty: 3,
					parTargetUnit: 'pak',
					isStaple: true,
					createdAt: new Date(),
					updatedAt: new Date()
				},
				{
					name: 'Olie',
					section: 'pantry',
					qtyNum: null,
					unit: 'l',
					parTargetQty: 2,
					parTargetUnit: 'l',
					isStaple: true,
					createdAt: new Date(),
					updatedAt: new Date()
				}
			])
			.returning()
			.all();

		const proposal = stageStockActionProposal(db, {
			userId: 1,
			title: 'Top up pantry targets',
			reason: 'Prepare only known deficits.',
			operations: [
				{
					kind: 'par_refill',
					itemIds: [rice.id, oil.id],
					reason: 'These pantry targets need checking.'
				}
			]
		});
		expect(proposal.operations).toHaveLength(1);
		expect(proposal.operations[0]).toMatchObject({
			label: 'Rijst',
			after: 'Add 2 pak to Shopping'
		});
		expect(proposal.recommendation).toMatchObject({
			confidence: 'medium',
			uncertainty: expect.stringMatching(/Olie/)
		});
	});

	it('does not prepare duplicate manual rows for existing Shopping sources', () => {
		const db = createTestDb();
		db.insert(schema.shoppingWeekEntries)
			.values({
				weekStartDate: '2026-07-29',
				sourceKey: 'manual:existing-oil',
				sourceKind: 'manual',
				name: 'Olie',
				approvedTerms: ['Olie'],
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.run();

		expect(() =>
			stageStockActionProposal(
				db,
				{
					userId: 1,
					title: 'Add oil',
					reason: 'The household asked for oil.',
					operations: [
						{
							kind: 'shopping_add',
							name: 'Olie',
							reason: 'Add one manual row.'
						}
					]
				},
				new Date('2026-07-29T10:00:00Z')
			)
		).toThrow(/authoritative Shopping source/i);
		expect(db.select().from(schema.shoppingWeekEntries).all()).toHaveLength(1);
	});

	it('changes one authoritative Shopping quantity and restores it on bundle undo', () => {
		const db = createTestDb();
		const entry = db
			.insert(schema.shoppingWeekEntries)
			.values({
				weekStartDate: '2026-07-29',
				sourceKey: 'manual:bread',
				sourceKind: 'manual',
				name: 'Brood',
				amount: '1',
				unit: 'stuk',
				approvedTerms: ['Brood'],
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.returning()
			.get();
		const proposal = stageStockActionProposal(
			db,
			{
				userId: 1,
				title: 'Make bread two',
				reason: 'The household changed the quantity.',
				operations: [
					{
						kind: 'shopping_change',
						name: 'Brood',
						change: 'set_quantity',
						amount: '2',
						unit: 'stuks',
						reason: 'Use the requested quantity.'
					}
				]
			},
			new Date('2026-07-29T10:00:00Z')
		);
		applyStockActionProposal(db, {
			token: proposal.token,
			userId: 1,
			operationIds: proposal.operations.map((operation) => operation.id)
		}, new Date('2026-07-29T10:01:00Z').getTime());
		expect(
			db.select().from(schema.shoppingWeekEntries).where(eq(schema.shoppingWeekEntries.id, entry.id)).get()
		).toMatchObject({ amountOverride: '2', unitOverride: 'stuks' });

		undoStockActionProposal(db, { token: proposal.token, userId: 1 });
		expect(
			db.select().from(schema.shoppingWeekEntries).where(eq(schema.shoppingWeekEntries.id, entry.id)).get()
		).toMatchObject({ amountOverride: null, unitOverride: null });
	});

	it('marks a bought row and adds its fridge intake in the same reviewed transaction', () => {
		const db = createTestDb();
		const entry = db
			.insert(schema.shoppingWeekEntries)
			.values({
				weekStartDate: '2026-07-29',
				sourceKey: 'manual:1',
				sourceKind: 'manual',
				name: 'Melk',
				approvedTerms: ['Melk'],
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.returning()
			.get();
		const proposal = stageStockActionProposal(
			db,
			{
				userId: 1,
				title: 'Unpack milk',
				reason: 'Milk was bought.',
				operations: [
					{
						kind: 'bought_intake',
						shoppingName: 'Melk',
						item: { name: 'Melk', section: 'fridge', qtyNum: 1, unit: 'l' },
						reason: 'Put the bought milk in fridge stock.'
					}
				]
			},
			new Date('2026-07-29T10:00:00Z')
		);
		const receipt = applyStockActionProposal(db, {
			token: proposal.token,
			userId: 1,
			operationIds: proposal.operations.map((operation) => operation.id)
		}, new Date('2026-07-29T10:01:00Z').getTime());
		expect(receipt).toMatchObject({ inventoryChanges: 1, shoppingChanges: 1 });
		expect(
			db.select().from(schema.shoppingWeekEntries).where(eq(schema.shoppingWeekEntries.id, entry.id)).get()
		).toMatchObject({ bought: true });
		expect(db.select().from(schema.inventoryItems).get()).toMatchObject({
			name: 'Melk',
			section: 'fridge',
			qtyNum: 1
		});
	});

	it('refuses stale approval and can undo both domains together', () => {
		const db = createTestDb();
		const rice = db
			.insert(schema.inventoryItems)
			.values({
				name: 'Rijst',
				section: 'pantry',
				qtyNum: 1,
				unit: 'pak',
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.returning()
			.get();
		const stale = stageStockActionProposal(db, {
			userId: 1,
			...recommendationInput,
			operations: [
				{ kind: 'stock_replace', itemId: rice.id, replacementName: 'Rijst', reason: 'Empty.' }
			]
		});
		db.update(schema.inventoryItems)
			.set({ qtyNum: 2, updatedAt: new Date(Date.now() + 1000) })
			.where(eq(schema.inventoryItems.id, rice.id))
			.run();
		expect(() =>
			applyStockActionProposal(db, {
				token: stale.token,
				userId: 1,
				operationIds: stale.operations.map((operation) => operation.id)
			})
		).toThrow(/changed/i);

		const fresh = stageStockActionProposal(db, {
			userId: 1,
			...recommendationInput,
			operations: [
				{ kind: 'stock_replace', itemId: rice.id, replacementName: 'Rijst', reason: 'Empty.' }
			]
		});
		applyStockActionProposal(db, {
			token: fresh.token,
			userId: 1,
			operationIds: fresh.operations.map((operation) => operation.id)
		});
		const undone = undoStockActionProposal(db, { token: fresh.token, userId: 1 });
		expect(undone).toMatchObject({ status: 'undone', atomicity: 'atomic' });
		expect(db.select().from(schema.inventoryItems).get()).toMatchObject({ qtyNum: 2 });
		expect(db.select().from(schema.shoppingWeekEntries).get()?.retiredAt).toBeInstanceOf(Date);
	});

	it('removes a manual Shopping row source-aware and restores it on bundle undo', () => {
		const db = createTestDb();
		const entry = db
			.insert(schema.shoppingWeekEntries)
			.values({
				weekStartDate: '2026-07-29',
				sourceKey: 'manual:1',
				sourceKind: 'manual',
				name: 'Koriander',
				approvedTerms: ['Koriander'],
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.returning()
			.get();
		const proposal = stageStockActionProposal(
			db,
			{
				userId: 1,
				title: 'Remove coriander',
				reason: 'The user asked to remove it from this week.',
				operations: [
					{
						kind: 'shopping_change',
						name: 'Koriander',
						change: 'remove',
						reason: 'Remove only the authoritative manual source.'
					}
				]
			},
			new Date('2026-07-29T10:00:00Z')
		);
		applyStockActionProposal(db, {
			token: proposal.token,
			userId: 1,
			operationIds: proposal.operations.map((operation) => operation.id)
		}, new Date('2026-07-29T10:01:00Z').getTime());
		expect(
			db.select().from(schema.shoppingWeekEntries).where(eq(schema.shoppingWeekEntries.id, entry.id)).get()
				?.retiredAt
		).toBeInstanceOf(Date);

		undoStockActionProposal(db, { token: proposal.token, userId: 1 });
		expect(
			db.select().from(schema.shoppingWeekEntries).where(eq(schema.shoppingWeekEntries.id, entry.id)).get()
		).toMatchObject({ retiredAt: null, included: true });
	});

	it('undoes a reviewed grocery intake larger than the ordinary ten-operation tool limit', () => {
		const db = createTestDb();
		const groceryNames = [
			'Rijst',
			'Pasta',
			'Bonen',
			'Linzen',
			'Koffie',
			'Thee',
			'Suiker',
			'Zout',
			'Peper',
			'Bloem',
			'Havermout'
		];
		const proposal = stageStockActionProposal(db, {
			userId: 1,
			title: 'Unpack groceries',
			reason: 'Eleven distinct groceries were dictated.',
			operations: [
				{
					kind: 'inventory_intake',
					items: groceryNames.map((name) => ({
						name,
						section: 'pantry' as const,
						qtyNum: 1,
						unit: 'pack'
					})),
					reason: 'Add the reviewed groceries.'
				}
			]
		});

		applyStockActionProposal(db, {
			token: proposal.token,
			userId: 1,
			operationIds: proposal.operations.map((operation) => operation.id)
		});
		expect(
			db.select().from(schema.inventoryItems).where(isNull(schema.inventoryItems.deletedAt)).all()
		).toHaveLength(11);

		expect(undoStockActionProposal(db, { token: proposal.token, userId: 1 })).toMatchObject({
			status: 'undone',
			atomicity: 'atomic'
		});
		expect(
			db.select().from(schema.inventoryItems).where(isNull(schema.inventoryItems.deletedAt)).all()
		).toEqual([]);
	});
});
