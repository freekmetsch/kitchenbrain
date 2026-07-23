import { describe, expect, it } from 'vitest';
import { normalizeCookProgress, selectCookStep } from './cook_progress';

const keys = ['0:recipe', '1:recipe', '2:recipe'];

describe('cook progress', () => {
	it('starts at the first step', () => {
		expect(normalizeCookProgress(keys, null)).toEqual({ currentKey: '0:recipe' });
	});

	it('restores a current step when it still exists', () => {
		expect(normalizeCookProgress(keys, '2:recipe')).toEqual({ currentKey: '2:recipe' });
	});

	it('resets stale progress to the first step', () => {
		expect(normalizeCookProgress(keys, '4:old')).toEqual({ currentKey: '0:recipe' });
	});

	it('selects without maintaining completion state', () => {
		expect(selectCookStep(keys, { currentKey: '0:recipe' }, '2:recipe')).toEqual({
			currentKey: '2:recipe'
		});
		expect(selectCookStep(keys, { currentKey: '0:recipe' }, '4:old')).toEqual({
			currentKey: '0:recipe'
		});
	});

	it('handles recipes without directions', () => {
		expect(normalizeCookProgress([], null)).toEqual({ currentKey: null });
	});
});
