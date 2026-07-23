export type CookModeFailureReason =
	| 'daily_cap_exceeded'
	| 'no_directions'
	| 'invalid_request'
	| 'recipe_not_found'
	| 'generation_failed';

export function readCookModeFailure(value: unknown): {
	reason: CookModeFailureReason;
	retryable: boolean;
} {
	const reason =
		value && typeof value === 'object' && 'reason' in value
			? (value as { reason?: unknown }).reason
			: null;
	if (reason === 'daily_cap_exceeded' || reason === 'no_directions') {
		return { reason, retryable: false };
	}
	if (reason === 'invalid_request' || reason === 'recipe_not_found') {
		return { reason, retryable: false };
	}
	return { reason: 'generation_failed', retryable: true };
}
