import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	recordReceipt: vi.fn()
}));

vi.mock('$lib/server/timer-alerts/runtime', () => ({
	timerAlertService: { recordReceipt: state.recordReceipt }
}));

import { POST } from './+server';

describe('POST /api/timer-alerts/jobs/[id]/receipts', () => {
	beforeEach(() => {
		state.recordReceipt.mockReset();
		state.recordReceipt.mockReturnValue({ accepted: true });
	});

	it('requires a household session and forwards only a validated owned receipt', async () => {
		const id = '4bb16cdf-f1bb-48c7-85dd-c6a86aeb01b4';
		const request = () =>
			new Request(`https://example.com/api/timer-alerts/jobs/${id}/receipts`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					event: 'notification-shown',
					occurredAt: 20_000
				})
			});
		await expect(
			POST({
				request: request(),
				locals: { user: null },
				params: { id }
			} as never)
		).rejects.toMatchObject({ status: 401 });

		const response = await POST({
			request: request(),
			locals: { user: { id: 7, username: 'cook' } },
			params: { id }
		} as never);

		await expect(response.json()).resolves.toEqual({ accepted: true });
		expect(state.recordReceipt).toHaveBeenCalledWith(7, id, {
			event: 'notification-shown',
			occurredAt: 20_000
		});
	});
});
