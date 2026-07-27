import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb, type TestDb } from '$lib/server/test_db';
import {
	claimAhPreviewToken,
	clearAhPreviewTokensForTest,
	createAhPreviewToken
} from '$lib/server/ah/preview_tokens';
import {
	pushShoppingToAh,
	type ShoppingAhAdapter,
	type ShoppingAhDependencies
} from './push-shopping-to-ah';

const WEEK = '2026-07-22';
const NOW = new Date('2026-07-27T12:00:00.000Z');

function fakeAdapter(
	overrides: Partial<ShoppingAhAdapter> = {}
): ShoppingAhAdapter {
	return {
		getStatus: () => ({ connected: true, memberName: 'Test household' }),
		searchProducts: async () => ({ ok: true, products: [] }),
		getProductsByIds: async () => [],
		pickArchetypes: async () => new Map(),
		getActiveOrder: async () => null,
		addProductItems: async () => ({
			ok: true,
			status: 200,
			uncertain: false
		}),
		addProductsToOrder: async () => ({
			ok: true,
			status: 200,
			uncertain: false
		}),
		addFreetextItems: async (items) => ({
			pushed: items,
			failed: [],
			uncertain: []
		}),
		isNotConnectedError: () => false,
		...overrides
	};
}

function dependencies(
	db: TestDb,
	ah: ShoppingAhAdapter
): ShoppingAhDependencies {
	return {
		db,
		ah,
		createPreviewToken: createAhPreviewToken,
		claimPreviewToken: claimAhPreviewToken,
		getWeekStartDay: () => 2,
		now: () => NOW
	};
}

function seedEntries(db: TestDb) {
	const rows = db
		.insert(schema.shoppingWeekEntries)
		.values([
			{
				weekStartDate: WEEK,
				sourceKey: 'manual:1',
				sourceKind: 'manual',
				name: 'pasta',
				amount: '400',
				unit: 'g',
				approvedTerms: ['pasta'],
				createdAt: NOW,
				updatedAt: NOW
			},
			{
				weekStartDate: WEEK,
				sourceKey: 'manual:2',
				sourceKind: 'manual',
				name: 'tomaten',
				amount: '2',
				unit: 'stuks',
				approvedTerms: ['tomaten'],
				createdAt: NOW,
				updatedAt: NOW
			}
		])
		.returning()
		.all();
	return { pasta: rows[0], tomatoes: rows[1] };
}

function tokenFor(
	userId: number,
	entries: ReturnType<typeof seedEntries>
): string {
	return createAhPreviewToken({
		userId,
		weekStart: WEEK,
		items: [
			{
				ref: `entries:${entries.pasta.id}`,
				entryIds: [entries.pasta.id],
				entryRevisions: [entries.pasta.revision],
				term: 'pasta',
				amount: '400',
				unit: 'g',
				offeredProducts: [{ id: '123', name: 'AH Pasta' }]
			},
			{
				ref: `entries:${entries.tomatoes.id}`,
				entryIds: [entries.tomatoes.id],
				entryRevisions: [entries.tomatoes.revision],
				term: 'tomaten',
				amount: '2',
				unit: 'stuks',
				offeredProducts: []
			}
		]
	});
}

describe('pushShoppingToAh', () => {
	beforeEach(() => {
		clearAhPreviewTokensForTest();
	});

	it('records pending before product-first dispatch and marks only definite successes bought', async () => {
		const db = createTestDb();
		const user = db.select().from(schema.users).get()!;
		const entries = seedEntries(db);
		const calls: string[] = [];
		const ah = fakeAdapter({
			addProductItems: async () => {
				calls.push('product');
				expect(
					db.select().from(schema.shoppingPushHistory).get()
				).toMatchObject({ attemptStatus: 'pending' });
				return { ok: true, status: 200, uncertain: false };
			},
			addFreetextItems: async () => {
				calls.push('freetext');
				return {
					pushed: [],
					failed: ['tomaten 2 stuks'],
					uncertain: []
				};
			}
		});

		const result = await pushShoppingToAh(
			{
				userId: user.id,
				previewToken: tokenFor(user.id, entries),
				decisions: [
					{
						ref: `entries:${entries.pasta.id}`,
						mode: 'product',
						productId: '123',
						qty: 1
					},
					{
						ref: `entries:${entries.tomatoes.id}`,
						mode: 'freetext'
					}
				]
			},
			dependencies(db, ah)
		);

		expect(calls).toEqual(['product', 'freetext']);
		expect(result).toMatchObject({
			ok: false,
			uncertain: false,
			markedBoughtRefs: [`entries:${entries.pasta.id}`]
		});
		expect(
			db
				.select()
				.from(schema.shoppingWeekEntries)
				.where(eq(schema.shoppingWeekEntries.id, entries.pasta.id))
				.get()?.bought
		).toBe(true);
		expect(
			db
				.select()
				.from(schema.shoppingWeekEntries)
				.where(eq(schema.shoppingWeekEntries.id, entries.tomatoes.id))
				.get()?.bought
		).toBe(false);
		expect(
			db.select().from(schema.shoppingPushHistory).get()
		).toMatchObject({ attemptStatus: 'failed', productsPushed: 1 });
		expect(
			db
				.select()
				.from(schema.shoppingPushItems)
				.all()
				.map((item) => item.status)
		).toEqual(['success', 'failed']);
	});

	it('claims an uncertain attempt once and never retries the external write', async () => {
		const db = createTestDb();
		const user = db.select().from(schema.users).get()!;
		const entries = seedEntries(db);
		let writes = 0;
		const ah = fakeAdapter({
			addProductItems: async () => {
				writes++;
				return { ok: false, status: 500, uncertain: true };
			}
		});
		const token = tokenFor(user.id, entries);
		const input = {
			userId: user.id,
			previewToken: token,
			decisions: [
				{
					ref: `entries:${entries.pasta.id}`,
					mode: 'product' as const,
					productId: '123',
					qty: 1
				},
				{
					ref: `entries:${entries.tomatoes.id}`,
					mode: 'exclude' as const
				}
			]
		};

		const result = await pushShoppingToAh(input, dependencies(db, ah));
		expect(result).toMatchObject({ ok: false, uncertain: true });
		expect(writes).toBe(1);
		expect(
			db.select().from(schema.shoppingPushHistory).get()
		).toMatchObject({ attemptStatus: 'uncertain' });
		expect(
			db
				.select()
				.from(schema.shoppingWeekEntries)
				.where(eq(schema.shoppingWeekEntries.id, entries.pasta.id))
				.get()?.bought
		).toBe(false);

		await expect(
			pushShoppingToAh(input, dependencies(db, ah))
		).rejects.toMatchObject({
			status: 409
		});
		expect(writes).toBe(1);
	});
});
