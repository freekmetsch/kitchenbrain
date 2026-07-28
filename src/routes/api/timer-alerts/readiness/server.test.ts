import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	readiness: vi.fn()
}));

vi.mock('$lib/server/timer-alerts/runtime', () => ({
	timerAlertService: { readiness: state.readiness }
}));

import { GET } from './+server';

describe('GET /api/timer-alerts/readiness', () => {
	beforeEach(() => {
		state.readiness.mockReset();
		state.readiness.mockReturnValue({ enabled: true, publicKey: 'public-key' });
	});

	it('requires a household session and returns only public readiness data', async () => {
		expect(() => GET({ locals: { user: null } } as never)).toThrowError(
			expect.objectContaining({ status: 401 })
		);

		const response = await GET({
			locals: { user: { id: 1, username: 'cook' } }
		} as never);
		await expect(response.json()).resolves.toEqual({
			enabled: true,
			publicKey: 'public-key'
		});
	});
});
