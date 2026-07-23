import { describe, expect, it } from 'vitest';
import { readCookModeFailure } from './cook_mode_recovery';

describe('cook-mode recovery', () => {
	it('maps server reasons to bounded retry behavior without exposing server copy', () => {
		expect(readCookModeFailure({ reason: 'daily_cap_exceeded', message: 'raw' })).toEqual({
			reason: 'daily_cap_exceeded',
			retryable: false
		});
		expect(readCookModeFailure({ reason: 'no_directions' })).toEqual({
			reason: 'no_directions',
			retryable: false
		});
		expect(readCookModeFailure({ reason: 'generation_failed', message: 'raw' })).toEqual({
			reason: 'generation_failed',
			retryable: true
		});
		expect(readCookModeFailure({ message: 'unexpected server prose' })).toEqual({
			reason: 'generation_failed',
			retryable: true
		});
	});
});
