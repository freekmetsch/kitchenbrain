import { describe, expect, it, vi } from 'vitest';
import { createTestDb } from '$lib/server/test_db';
import { users } from '$lib/server/db/schema';
import { createTimerAlertRepository } from './repository';
import { createTimerAlertService, TimerAlertServiceError } from './service';

describe('timer alert service', () => {
	it('sends a test alert only to a subscription owned by the signed-in user', async () => {
		const db = createTestDb();
		const userId = db.select({ id: users.id }).from(users).get()!.id;
		const repository = createTimerAlertRepository(db);
		const send = vi.fn(async () => ({ outcome: 'sent' as const }));
		const service = createTimerAlertService({
			repository,
			send,
			publicKey: 'public-vapid-key',
			now: () => new Date(20_000)
		});
		const subscription = service.subscribe(userId, {
			endpoint: 'https://fcm.googleapis.com/fcm/send/service-subscription',
			keys: { p256dh: `B${'A'.repeat(86)}`, auth: 'A'.repeat(22) },
			deviceLabel: 'Kitchen phone'
		});

		await expect(service.sendTest(userId, subscription.id)).resolves.toEqual({
			accepted: true
		});
		await expect(service.sendTest(userId + 1, subscription.id)).rejects.toEqual(
			new TimerAlertServiceError('not_found', 'Timer alert subscription not found')
		);
		expect(send).toHaveBeenCalledOnce();
	});

	it('bounds stored delivery capabilities per user', () => {
		const db = createTestDb();
		const userId = db.select({ id: users.id }).from(users).get()!.id;
		const service = createTimerAlertService({
			repository: createTimerAlertRepository(db),
			send: async () => ({ outcome: 'sent' }),
			publicKey: 'public-vapid-key'
		});
		for (let index = 0; index < 5; index++) {
			service.subscribe(userId, {
				endpoint: `https://fcm.googleapis.com/fcm/send/subscription-${index}`,
				keys: { p256dh: `B${'A'.repeat(86)}`, auth: 'A'.repeat(22) }
			});
		}

		expect(() =>
			service.subscribe(userId, {
				endpoint: 'https://fcm.googleapis.com/fcm/send/subscription-over-cap',
				keys: { p256dh: `B${'A'.repeat(86)}`, auth: 'A'.repeat(22) }
			})
		).toThrow('Too many timer alert subscriptions');
	});
});
