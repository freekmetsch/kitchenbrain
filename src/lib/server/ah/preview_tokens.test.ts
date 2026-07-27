import { beforeEach, describe, expect, it } from 'vitest';
import { AhPushBodySchema, bindAhPushDecisions, claimAhPreviewToken, clearAhPreviewTokensForTest, createAhPreviewToken, isAhEligibleShoppingRow } from './preview_tokens';

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
		const expired = createAhPreviewToken({ userId: 7, weekStart: '2026-07-22', items: [item] }, { now: 100, ttlMs: 1 });
		expect(claimAhPreviewToken(expired, 7, 101)).toBeNull();
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
