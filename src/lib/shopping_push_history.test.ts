import { describe, expect, it } from 'vitest';
import {
	resolveShoppingPushOutcome,
	shoppingPushOutcomeNeedsReview,
	splitShoppingPushItems
} from './shopping_push_history';

describe('resolveShoppingPushOutcome', () => {
	it.each([
		['pending', 0, 0, 0, 'pending'],
		['uncertain', 2, 0, 0, 'uncertain'],
		['failed', 0, 3, 0, 'failed'],
		['succeeded', 2, 1, 0, 'partial'],
		['succeeded', 2, 0, 1, 'partial'],
		['succeeded', 2, 0, 0, 'success']
	] as const)(
		'prioritizes %s attempts with %i sent, %i failed, and %i skipped as %s',
		(attemptStatus, sentCount, failedCount, skippedCount, outcome) => {
			expect(
				resolveShoppingPushOutcome({ attemptStatus, sentCount, failedCount, skippedCount })
			).toBe(outcome);
		}
	);

	it('keeps two unresolved lines visible and discloses overflow plus resolved detail', () => {
		const items = [
			{ id: 'resolved', status: 'success' as const },
			{ id: 'skipped', status: 'skipped' as const },
			{ id: 'uncertain', status: 'uncertain' as const },
			{ id: 'failed', status: 'failed' as const }
		];
		expect(splitShoppingPushItems(items)).toEqual({
			visible: [items[2], items[3]],
			disclosed: [items[1], items[0]]
		});
	});

	it('never moves resolved lines ahead of action-relevant unresolved lines', () => {
		const items = [
			{ id: 'resolved', status: 'success' as const },
			{ id: 'failed', status: 'failed' as const }
		];
		expect(splitShoppingPushItems(items)).toEqual({
			visible: [items[1]],
			disclosed: [items[0]]
		});
	});

	it.each(['pending', 'uncertain', 'failed', 'partial'] as const)(
		'keeps the %s outcome on the safety-review path',
		(outcome) => {
			expect(shoppingPushOutcomeNeedsReview(outcome)).toBe(true);
		}
	);

	it('keeps success compact and outside the safety-review path', () => {
		expect(shoppingPushOutcomeNeedsReview('success')).toBe(false);
	});
});
