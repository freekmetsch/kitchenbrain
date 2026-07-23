import { describe, expect, it } from 'vitest';
import { distinctTimerStepTitle } from './timer_labels';

describe('timer labels', () => {
	it('hides an equivalent secondary title but preserves distinct context', () => {
		expect(distinctTimerStepTitle('Simmer until thick.', '  simmer   until thick. ')).toBeNull();
		expect(distinctTimerStepTitle('Curry', 'Simmer until thick.')).toBe('Curry');
	});
});
