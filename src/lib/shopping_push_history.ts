export type ShoppingPushAttemptStatus = 'pending' | 'succeeded' | 'failed' | 'uncertain';
export type ShoppingPushOutcome = 'pending' | 'uncertain' | 'failed' | 'partial' | 'success';
export type ShoppingPushItemStatus = 'success' | 'failed' | 'skipped' | 'uncertain';

const ITEM_STATUS_RANK: Record<ShoppingPushItemStatus, number> = {
	uncertain: 0,
	failed: 1,
	skipped: 2,
	success: 3
};

export function orderShoppingPushItems<T extends { status: ShoppingPushItemStatus }>(
	items: T[]
): T[] {
	return [...items].sort(
		(left, right) => ITEM_STATUS_RANK[left.status] - ITEM_STATUS_RANK[right.status]
	);
}

export function splitShoppingPushItems<T extends { status: ShoppingPushItemStatus }>(
	items: T[],
	unresolvedLimit = 2
): { visible: T[]; disclosed: T[] } {
	const ordered = orderShoppingPushItems(items);
	const unresolved = ordered.filter((item) => item.status !== 'success');
	const resolved = ordered.filter((item) => item.status === 'success');
	return {
		visible: unresolved.slice(0, unresolvedLimit),
		disclosed: [...unresolved.slice(unresolvedLimit), ...resolved]
	};
}

export function shoppingPushOutcomeNeedsReview(outcome: ShoppingPushOutcome): boolean {
	return outcome !== 'success';
}

export function resolveShoppingPushOutcome(input: {
	attemptStatus: ShoppingPushAttemptStatus;
	sentCount: number;
	failedCount: number;
	skippedCount: number;
}): ShoppingPushOutcome {
	if (input.attemptStatus === 'pending') return 'pending';
	if (input.attemptStatus === 'uncertain') return 'uncertain';
	if (input.attemptStatus === 'failed') return 'failed';
	if (input.failedCount > 0 || input.skippedCount > 0) return 'partial';
	return 'success';
}
