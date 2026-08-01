import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	PLANNED_SERVINGS_WRITE_TIMEOUT_MS,
	writePlannedServings
} from './planned_servings_client';

afterEach(() => vi.unstubAllGlobals());

describe('writePlannedServings', () => {
	it('bounds the request that navigation flush waits for', async () => {
		const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			expect(init?.signal).toBeInstanceOf(AbortSignal);
			expect(init?.signal?.aborted).toBe(false);
			return new Response(JSON.stringify({ id: 7, servings: 5 }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		});
		vi.stubGlobal('fetch', fetcher);

		await expect(writePlannedServings(7, 5)).resolves.toEqual({ id: 7, servings: 5 });
		expect(PLANNED_SERVINGS_WRITE_TIMEOUT_MS).toBe(15_000);
	});
});
