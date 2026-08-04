import { beforeEach, describe, expect, it } from 'vitest';
import {
	AhPushBodySchema,
	bindAhPushDecisions,
	claimAhPreviewToken,
	clearAhPreviewTokensForTest,
	createAhPreviewToken,
	isAhEligibleShoppingRow,
	offerAhPreviewProducts,
	peekAhPreviewToken,
	refreshAhPreviewToken
} from './preview_tokens';

const item = { ref: 'entries:1', entryIds: [1], entryRevisions: [2], term: 'pasta', amount: '400', unit: 'g', offeredProducts: [{ id: 'ah-1', name: 'AH Pasta' }] };

describe('AH preview tokens', () => {
	beforeEach(clearAhPreviewTokensForTest);

	it('binds one preview to its user and consumes it once', () => {
		const token = createAhPreviewToken({ userId: 7, weekStart: '2026-07-22', items: [item] }, { now: 100 });
		expect(claimAhPreviewToken(token, 7, 101)?.items[0]).toEqual(item);
		expect(claimAhPreviewToken(token, 7, 102)).toBeNull();
	});

	it('rejects another user and an expired preview', () => {
		const other = createAhPreviewToken({ userId: 7, weekStart: '2026-07-22', items: [item] }, { now: 100 });
		expect(claimAhPreviewToken(other, 8, 101)).toBeNull();
		expect(claimAhPreviewToken(other, 7, 101)).not.toBeNull();
		const expired = createAhPreviewToken({ userId: 7, weekStart: '2026-07-22', items: [item] }, { now: 100, ttlMs: 1 });
		expect(claimAhPreviewToken(expired, 7, 101)).toBeNull();
	});

	it('renews an active preview for the owning user without replacing or consuming it', () => {
		const token = createAhPreviewToken(
			{ userId: 7, weekStart: '2026-07-22', items: [item] },
			{ now: 100, ttlMs: 10 }
		);
		expect(refreshAhPreviewToken(token, 8, 105)).toBe(false);
		expect(refreshAhPreviewToken(token, 7, 105)).toBe(true);
		expect(claimAhPreviewToken(token, 7, 116)).not.toBeNull();
	});

	it('does not revive an expired or replaced preview', () => {
		const expired = createAhPreviewToken(
			{ userId: 7, weekStart: '2026-07-22', items: [item] },
			{ now: 100, ttlMs: 1 }
		);
		expect(refreshAhPreviewToken(expired, 7, 101)).toBe(false);

		const replaced = createAhPreviewToken({ userId: 7, weekStart: '2026-07-22', items: [item] }, { now: 200 });
		createAhPreviewToken({ userId: 7, weekStart: '2026-07-22', items: [item] }, { now: 201 });
		expect(refreshAhPreviewToken(replaced, 7, 202)).toBe(false);
	});

	it('peeks without consuming and extends only the bound row for the owning user', () => {
		const token = createAhPreviewToken({ userId: 7, weekStart: '2026-07-22', items: [item] }, { now: 100 });
		expect(peekAhPreviewToken(token, 7, 101)?.items[0]).toEqual(item);
		expect(offerAhPreviewProducts(token, 7, item.ref, [
			{ id: 'ah-2', name: 'AH Spaghetti' },
			{ id: 'ah-1', name: 'Renamed duplicate' }
		], 102)).toEqual(['ah-2', 'ah-1']);
		expect(claimAhPreviewToken(token, 7, 103)?.items[0].offeredProducts).toEqual([
			{ id: 'ah-1', name: 'AH Pasta' },
			{ id: 'ah-2', name: 'AH Spaghetti' }
		]);
	});

	it('fails closed when extending another row, user, expired token, or replaced preview', () => {
		const token = createAhPreviewToken({ userId: 7, weekStart: '2026-07-22', items: [item] }, { now: 100 });
		const offered = [{ id: 'ah-2', name: 'AH Spaghetti' }];
		expect(offerAhPreviewProducts(token, 7, 'entries:999', offered, 101)).toBeNull();
		expect(offerAhPreviewProducts(token, 8, item.ref, offered, 101)).toBeNull();
		const replacement = createAhPreviewToken({ userId: 7, weekStart: '2026-07-22', items: [item] }, { now: 102 });
		expect(offerAhPreviewProducts(token, 7, item.ref, offered, 103)).toBeNull();
		expect(offerAhPreviewProducts(replacement, 7, item.ref, offered, 103)).toEqual(['ah-2']);

		const expired = createAhPreviewToken({ userId: 7, weekStart: '2026-07-22', items: [item] }, { now: 200, ttlMs: 1 });
		expect(offerAhPreviewProducts(expired, 7, item.ref, offered, 201)).toBeNull();
	});

	it('bounds the products authorized for one row', () => {
		const token = createAhPreviewToken({ userId: 7, weekStart: '2026-07-22', items: [item] }, { now: 100 });
		const offered = Array.from({ length: 120 }, (_, index) => ({
			id: `ah-${index + 2}`,
			name: `AH Product ${index + 2}`
		}));
		const authorized = offerAhPreviewProducts(token, 7, item.ref, offered, 101);
		expect(authorized).toHaveLength(99);
		expect(peekAhPreviewToken(token, 7, 102)?.items[0].offeredProducts).toHaveLength(100);
	});

	it('revokes the older review when the same user opens a newer one for the week', () => {
		const first = createAhPreviewToken({ userId: 7, weekStart: '2026-07-22', items: [item] }, { now: 100 });
		const latest = createAhPreviewToken({ userId: 7, weekStart: '2026-07-22', items: [item] }, { now: 101 });
		expect(claimAhPreviewToken(first, 7, 102)).toBeNull();
		expect(claimAhPreviewToken(latest, 7, 102)).not.toBeNull();
	});

	it('rejects invented products, cross-item products, missing refs, duplicates, and bad pack counts', () => {
		const second = { ...item, ref: 'entries:2', entryIds: [2], offeredProducts: [{ id: 'ah-2', name: 'AH Rijst' }] };
		expect(() => bindAhPushDecisions([item, second], [
			{ ref: item.ref, mode: 'product', productId: 'ah-2', qty: 1 },
			{ ref: second.ref, mode: 'exclude' }
		])).toThrow(/offered/);
		expect(() => bindAhPushDecisions([item, second], [{ ref: item.ref, mode: 'exclude' }])).toThrow(/match/);
		expect(() => bindAhPushDecisions([item], [
			{ ref: item.ref, mode: 'exclude' },
			{ ref: item.ref, mode: 'freetext' }
		])).toThrow(/one decision/);
		expect(AhPushBodySchema.safeParse({ previewToken: 'x'.repeat(24), decisions: [{ ref: item.ref, mode: 'product', productId: 'ah-1', qty: 100 }] }).success).toBe(false);
	});

	it('requires explicit pack confirmation for incompatible source quantities', () => {
		const incompatible = { ...item, incompatibleQuantities: true };
		expect(() => bindAhPushDecisions(
			[incompatible],
			[{ ref: item.ref, mode: 'product', productId: 'ah-1', qty: 1 }]
		)).toThrow(/Confirm the pack quantity/);
		expect(() => bindAhPushDecisions(
			[incompatible],
			[{ ref: item.ref, mode: 'product', productId: 'ah-1', qty: 1, quantityConfirmed: true }]
		)).not.toThrow();
	});

	it('rejects client copies of every server-owned item field', () => {
		for (const field of ['term', 'amount', 'unit', 'sourceName', 'productName', 'entryIds', 'entryRevisions', 'weekStart']) {
			const parsed = AhPushBodySchema.safeParse({
				previewToken: 'x'.repeat(24),
				decisions: [{ ref: item.ref, mode: 'product', productId: 'ah-1', qty: 1, [field]: 'tampered' }]
			});
			expect(parsed.success, field).toBe(false);
		}
	});

	it('allows only uncovered rows whose effective Dutch terms are approved', () => {
		expect(isAhEligibleShoppingRow({ covered: false, sources: [{ term: 'pasta', approvedTerms: ['pasta', 'penne'] }] })).toBe(true);
		expect(isAhEligibleShoppingRow({ covered: true, sources: [{ term: 'pasta', approvedTerms: ['pasta'] }] })).toBe(false);
		expect(isAhEligibleShoppingRow({ covered: false, sources: [{ term: 'spaghetti', approvedTerms: ['pasta'] }] })).toBe(false);
	});
});
