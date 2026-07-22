import { describe, expect, it } from 'vitest';
import { normalizeCookProgress, reduceCookProgress } from './cook_progress';

const keys = ['0:a', '1:b', '2:a'];

describe('cook progress', () => {
	it('starts at the first incomplete step and uses the last when all are complete', () => {
		expect(normalizeCookProgress(keys, new Set(['0:a']), null).currentKey).toBe('1:b');
		expect(normalizeCookProgress(keys, new Set(keys), null).currentKey).toBe('2:a');
	});

	it('normalizes a restored completed key to the next gap, then wraps', () => {
		expect(normalizeCookProgress(keys, new Set(['0:a', '1:b']), '1:b').currentKey).toBe('2:a');
		expect(normalizeCookProgress(keys, new Set(['0:a', '2:a']), '2:a').currentKey).toBe('1:b');
	});

	it('advances only when the current step is completed', () => {
		const current = { currentKey: '0:a', completed: new Set<string>() };
		expect(reduceCookProgress(keys, current, { type: 'toggle', key: '0:a' }).currentKey).toBe('1:b');
		expect(reduceCookProgress(keys, current, { type: 'toggle', key: '2:a' }).currentKey).toBe('0:a');
	});

	it('selects a reopened step and never completes on manual selection', () => {
		const state = { currentKey: '1:b', completed: new Set(['0:a']) };
		const reopened = reduceCookProgress(keys, state, { type: 'toggle', key: '0:a' });
		expect(reopened.currentKey).toBe('0:a');
		expect(reopened.completed.has('0:a')).toBe(false);
		const selected = reduceCookProgress(keys, state, { type: 'select', key: '2:a' });
		expect(selected.completed).toEqual(state.completed);
	});
});
