import { describe, expect, it } from 'vitest';
import { resolveShoppingPushOutcome } from './shopping_push_history';

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
});
