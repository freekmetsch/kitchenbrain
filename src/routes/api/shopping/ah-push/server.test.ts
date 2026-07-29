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
vi.mock('$lib/server/domains/shopping', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/domains/shopping')>()),
	getShoppingWeekView: () => state.view
}));
vi.mock('$lib/server/ah/client', () => ({
	searchProducts: vi.fn(),
	getProductsByIds: vi.fn(),
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
			incompatibleQuantities: false,
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
	return pushWithDecisions(user, previewToken, [
		{ ref: 'entries:1', mode: 'product', productId: '123', qty: 1 }
	]);
}

async function pushWithDecisions(
	user: { id: number; username: string },
	previewToken: string,
	decisions: Array<Record<string, unknown>>
) {
	return POST({
		request: new Request('http://localhost/api/shopping/ah-push', {
			method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ previewToken, decisions })
		}),
		locals: { user }
	} as never);
}

function setupIncompatible() {
	state.db = createTestDb();
	const now = new Date();
	const user = state.db.insert(schema.users).values({
		username: 'test', passwordHash: 'none', createdAt: now
	}).returning().get();
	const entries = state.db.insert(schema.shoppingWeekEntries).values([
		{
			weekStartDate: WEEK, sourceKey: 'manual:1', sourceKind: 'manual',
			name: 'tomaten', amount: '2', unit: 'stuks', approvedTerms: ['tomaten'],
			createdAt: now, updatedAt: now
		},
		{
			weekStartDate: WEEK, sourceKey: 'manual:2', sourceKind: 'manual',
			name: 'tomaten', amount: '1', unit: 'blik', approvedTerms: ['tomaten'],
			createdAt: now, updatedAt: now
		}
	]).returning().all();
	const sources = entries.map((entry) => ({
		id: entry.id,
		revision: entry.revision,
		name: entry.name,
		amount: entry.amount,
		unit: entry.unit,
		sourceKind: entry.sourceKind,
		recipeTitle: null,
		term: 'tomaten',
		approvedTerms: ['tomaten']
	}));
	const ref = `entries:${entries.map((entry) => entry.id).join(',')}`;
	state.view = {
		toBuy: [{
			entryIds: entries.map((entry) => entry.id),
			name: 'tomaten',
			amount: null,
			unit: null,
			incompatibleQuantities: true,
			covered: false,
			sources
		}]
	};
	const previewToken = createAhPreviewToken({
		userId: user.id,
		weekStart: WEEK,
		items: [{
			ref,
			entryIds: entries.map((entry) => entry.id),
			entryRevisions: entries.map((entry) => entry.revision),
			term: 'tomaten',
			amount: null,
			unit: null,
			incompatibleQuantities: true,
			quantitySummary: '2 stuks + 1 blik',
			conflictSignature: 'incompatible_quantity:2:2:0',
			offeredProducts: [{ id: '456', name: 'AH Tomaten' }]
		}]
	});
	return { user, entries, previewToken, ref };
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
	}, 15_000);

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

	it('requires pack confirmation, sends one product decision, and marks every incompatible source bought', async () => {
		const { user, entries, previewToken, ref } = setupIncompatible();
		await expect(pushWithDecisions(user, previewToken, [
			{ ref, mode: 'product', productId: '456', qty: 1 }
		])).rejects.toMatchObject({ status: 400 });
		expect(state.addProductItems).not.toHaveBeenCalled();

		const fresh = setupIncompatible();
		state.addProductItems.mockResolvedValue({ ok: true, status: 200, uncertain: false });
		const response = await pushWithDecisions(fresh.user, fresh.previewToken, [
			{ ref: fresh.ref, mode: 'product', productId: '456', qty: 2, quantityConfirmed: true }
		]);
		expect(await response.json()).toMatchObject({ ok: true, markedBoughtRefs: [fresh.ref] });
		expect(state.addProductItems).toHaveBeenCalledWith([{ id: '456', qty: 2 }]);
		const bought = state.db.select().from(schema.shoppingWeekEntries).all();
		expect(bought).toHaveLength(entries.length);
		expect(bought.every((entry) => entry.bought)).toBe(true);
	});

	it('preserves every incompatible source amount in the free-text fallback', async () => {
		const { user, previewToken, ref } = setupIncompatible();
		state.addFreetextItems.mockResolvedValue({
			pushed: ['tomaten — 2 stuks + 1 blik'],
			failed: [],
			uncertain: []
		});
		const response = await pushWithDecisions(user, previewToken, [
			{ ref, mode: 'freetext' }
		]);
		expect(await response.json()).toMatchObject({ ok: true, markedBoughtRefs: [ref] });
		expect(state.addFreetextItems).toHaveBeenCalledWith(['tomaten — 2 stuks + 1 blik']);
		expect(state.db.select().from(schema.shoppingWeekEntries).all().every((entry) => entry.bought)).toBe(true);
	});

	it('rejects an incompatible preview when one contributing source revision changed', async () => {
		const { user, previewToken, ref } = setupIncompatible();
		const view = state.view as {
			toBuy: Array<{ sources: Array<{ revision: number }> }>;
		};
		view.toBuy[0].sources[1].revision += 1;
		await expect(pushWithDecisions(user, previewToken, [
			{ ref, mode: 'freetext' }
		])).rejects.toMatchObject({ status: 409 });
		expect(state.addFreetextItems).not.toHaveBeenCalled();
	});
});
