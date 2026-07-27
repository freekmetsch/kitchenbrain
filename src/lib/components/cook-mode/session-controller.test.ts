import { describe, expect, it } from 'vitest';
import { CookSessionStorageController, type CookSessionStorage } from './session-controller.svelte';

function memoryStorage(): CookSessionStorage & { values: Map<string, string> } {
	const values = new Map<string, string>();
	return {
		values,
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => values.set(key, value),
		removeItem: (key) => {
			values.delete(key);
		}
	};
}

describe('CookSessionStorageController', () => {
	it('keeps recipe and plan sessions isolated by key', () => {
		const storage = memoryStorage();
		const direct = new CookSessionStorageController('cook:a:direct', storage);
		const planned = new CookSessionStorageController('cook:a:42', storage);

		direct.save({ marker: 'direct' });
		planned.save({ marker: 'planned' });

		expect(storage.values.get('cook:a:direct')).toBe('{"marker":"direct"}');
		expect(storage.values.get('cook:a:42')).toBe('{"marker":"planned"}');
	});

	it('clears malformed sessions and reports a safe discard', () => {
		const storage = memoryStorage();
		storage.values.set('cook:a:direct', '{"v":2}');
		const sessions = new CookSessionStorageController('cook:a:direct', storage);

		expect(sessions.read()).toEqual({ state: 'discard' });
		expect(storage.values.has('cook:a:direct')).toBe(false);
	});

	it('degrades to ephemeral state when storage throws', () => {
		const storage: CookSessionStorage = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			},
			removeItem: () => {
				throw new Error('blocked');
			}
		};
		const sessions = new CookSessionStorageController('cook:a:direct', storage);

		expect(sessions.read()).toEqual({ state: 'discard' });
		expect(() => sessions.save({ marker: 'ignored' })).not.toThrow();
		expect(() => sessions.clear()).not.toThrow();
	});
});
