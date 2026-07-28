import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	getStatus: vi.fn()
}));

vi.mock('$lib/server/timer-alerts/runtime', () => ({
	timerAlertService: {
		getStatus: state.getStatus,
		schedule: vi.fn(),
		cancel: vi.fn()
	}
}));

import { GET } from './+server';

describe('GET /api/timer-alerts/jobs/[id]', () => {
	beforeEach(() => {
		state.getStatus.mockReset();
		state.getStatus.mockReturnValue({
			id: '4bb16cdf-f1bb-48c7-85dd-c6a86aeb01b4',
			kind: 'test',
			stage: 'worker-received'
		});
	});

	it('requires a household session and reads status through the owned service boundary', async () => {
		const id = '4bb16cdf-f1bb-48c7-85dd-c6a86aeb01b4';
		expect(() =>
			GET({
				locals: { user: null },
				params: { id }
			} as never)
		).toThrow(expect.objectContaining({ status: 401 }));

		const response = await GET({
			locals: { user: { id: 7, username: 'cook' } },
			params: { id }
		} as never);

		await expect(response.json()).resolves.toMatchObject({
			id,
			kind: 'test',
			stage: 'worker-received'
		});
		expect(state.getStatus).toHaveBeenCalledWith(7, id);
	});
});
