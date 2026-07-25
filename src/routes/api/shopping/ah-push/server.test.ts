import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb, type TestDb } from '$lib/server/test_db';
import { clearAhPreviewTokensForTest, createAhPreviewToken } from '$lib/server/ah/preview_tokens';

const state = vi.hoisted(() => ({
	db: null as unknown as TestDb,
	view: null as unknown,
	addProductItems: vi.fn(),
	addFreetextItems: vi.fn(),
	getActiveOrder: vi.fn(),
	addProductsToOrder: vi.fn()
}));

vi.mock('$lib/server/db/index', () => ({ get db() { return state.db; } }));
vi.mock('$lib/server/shopping_view', () => ({ getShoppingWeekView: () => state.view }));
vi.mock('$lib/server/ah/client', () => ({
	addProductItems: state.addProductItems,
	addFreetextItems: state.addFreetextItems,
	getActiveOrder: state.getActiveOrder,
	addProductsToOrder: state.addProductsToOrder,
	getAHStatus: () => ({ connected: true, memberName: 'Test household' }),
	AHNotConnectedError: class extends Error {},
	AH_NOT_CONNECTED: 'AH is not connected'
}));

import { POST } from './+server';

const WEEK = '2026-07-22';

function setup() {
	state.db = createTestDb();
	const now = new Date();
	const user = state.db.insert(schema.users).values({
		username: 'test', passwordHash: 'none', createdAt: now
	}).returning().get();
	const entry = state.db.insert(schema.shoppingWeekEntries).values({
		weekStartDate: WEEK, sourceKey: 'manual:1', sourceKind: 'manual',
		name: 'pasta', amount: '400', unit: 'g', approvedTerms: ['pasta'],
		createdAt: now, updatedAt: now
	}).returning().get();
	const source = {
		id: entry.id, revision: entry.revision, term: 'pasta', approvedTerms: ['pasta']
	};
	state.view = {
		toBuy: [{
			entryIds: [entry.id], name: 'pasta', amount: '400', unit: 'g', covered: false,
			sources: [source]
		}]
	};
	const previewToken = createAhPreviewToken({
		userId: user.id, weekStart: WEEK,
		items: [{
			ref: `entries:${entry.id}`, entryIds: [entry.id], entryRevisions: [entry.revision],
			term: 'pasta', amount: '400', unit: 'g',
			offeredProducts: [{ id: '123', name: 'AH Pasta' }]
		}]
	});
	return { user, entry, previewToken };
}

async function push(user: { id: number; username: string }, previewToken: string) {
	return POST({
		request: new Request('http://localhost/api/shopping/ah-push', {
			method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				previewToken,
				decisions: [{ ref: 'entries:1', mode: 'product', productId: '123', qty: 1 }]
			})
		}),
		locals: { user }
	} as never);
}

describe('AH push attempt state', () => {
	beforeEach(() => {
		clearAhPreviewTokensForTest();
		vi.clearAllMocks();
		state.getActiveOrder.mockResolvedValue(null);
		state.addFreetextItems.mockResolvedValue({ pushed: [], failed: [], uncertain: [] });
	});

	it('writes pending before one successful dispatch, then marks history and the source', async () => {
		const { user, entry, previewToken } = setup();
		state.addProductItems.mockImplementation(async () => {
			expect(state.db.select().from(schema.shoppingPushHistory).get()).toMatchObject({ attemptStatus: 'pending' });
			return { ok: true, status: 200, uncertain: false };
		});
		await push(user, previewToken);
		expect(state.addProductItems).toHaveBeenCalledTimes(1);
		expect(state.db.select().from(schema.shoppingPushHistory).get()).toMatchObject({ attemptStatus: 'succeeded', productsPushed: 1 });
		expect(state.db.select().from(schema.shoppingPushItems).get()).toMatchObject({ status: 'success' });
		expect(state.db.select().from(schema.shoppingWeekEntries).where(eq(schema.shoppingWeekEntries.id, entry.id)).get()?.bought).toBe(true);
	});

	it('records a definite rejection as failed without marking bought', async () => {
		const { user, previewToken } = setup();
		state.addProductItems.mockResolvedValue({ ok: false, status: 400, uncertain: false });
		await push(user, previewToken);
		expect(state.db.select().from(schema.shoppingPushHistory).get()).toMatchObject({ attemptStatus: 'failed' });
		expect(state.db.select().from(schema.shoppingPushItems).get()).toMatchObject({ status: 'failed' });
		expect(state.db.select().from(schema.shoppingWeekEntries).get()?.bought).toBe(false);
	});

	it('records an ambiguous response as uncertain and never redispatches it', async () => {
		const { user, previewToken } = setup();
		state.addProductItems.mockResolvedValue({ ok: false, status: 500, uncertain: true });
		const response = await push(user, previewToken);
		expect(await response.json()).toMatchObject({ ok: false, uncertain: true });
		expect(state.addProductItems).toHaveBeenCalledTimes(1);
		expect(state.db.select().from(schema.shoppingPushHistory).get()).toMatchObject({ attemptStatus: 'uncertain' });
		expect(state.db.select().from(schema.shoppingPushItems).get()).toMatchObject({ status: 'uncertain' });
		expect(state.db.select().from(schema.shoppingWeekEntries).get()?.bought).toBe(false);
	});

	it('records a thrown timeout as uncertain', async () => {
		const { user, previewToken } = setup();
		state.addProductItems.mockRejectedValue(new Error('timeout'));
		await push(user, previewToken);
		expect(state.addProductItems).toHaveBeenCalledTimes(1);
		expect(state.db.select().from(schema.shoppingPushHistory).get()).toMatchObject({ attemptStatus: 'uncertain' });
	});

	it('recovers a local finalization failure as uncertain after AH accepted the write', async () => {
		const { user, entry, previewToken } = setup();
		state.addProductItems.mockResolvedValue({ ok: true, status: 200, uncertain: false });
		vi.spyOn(state.db, 'transaction').mockImplementationOnce(() => {
			throw new Error('local finalization failed');
		});
		const response = await push(user, previewToken);
		expect(await response.json()).toMatchObject({
			uncertain: true,
			markedBoughtRefs: [`entries:${entry.id}`]
		});
		expect(state.addProductItems).toHaveBeenCalledTimes(1);
		expect(state.db.select().from(schema.shoppingPushHistory).get()).toMatchObject({ attemptStatus: 'uncertain' });
		expect(state.db.select().from(schema.shoppingPushItems).get()).toMatchObject({ status: 'success' });
	});
});
