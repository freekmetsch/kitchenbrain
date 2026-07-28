import { describe, expect, it, vi } from 'vitest';
import {
	TimerReceiptOutbox,
	type StoredTimerReceipt
} from './receipt-outbox';

describe('TimerReceiptOutbox', () => {
	it('queues a failed receipt and removes it after a later successful flush', async () => {
		const stored = new Map<string, StoredTimerReceipt>();
		const send = vi
			.fn()
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(true);
		const outbox = new TimerReceiptOutbox({
			send,
			list: async () => [...stored.values()],
			put: async (receipt) => {
				stored.set(receipt.key, receipt);
			},
			remove: async (key) => {
				stored.delete(key);
			},
			now: () => 20_000
		});

		await outbox.record({
			id: '4bb16cdf-f1bb-48c7-85dd-c6a86aeb01b4',
			event: 'worker-received',
			occurredAt: 20_000
		});
		expect(stored.size).toBe(1);

		await outbox.flush();

		expect(send).toHaveBeenCalledTimes(2);
		expect(stored.size).toBe(0);
	});
});
