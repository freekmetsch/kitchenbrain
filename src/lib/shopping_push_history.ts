export type ShoppingPushAttemptStatus = 'pending' | 'succeeded' | 'failed' | 'uncertain';
export type ShoppingPushOutcome = 'pending' | 'uncertain' | 'failed' | 'partial' | 'success';

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
