import { describe, expect, it, vi } from 'vitest';
import { createTestDb } from '$lib/server/test_db';
import { timerAlertJobs, users } from '$lib/server/db/schema';
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

		const result = await service.sendTest(userId, subscription.id);
		expect(result).toMatchObject({
			id: expect.any(String),
			stage: 'provider-accepted'
		});
		expect(service.getStatus(userId, result.id)).toMatchObject({
			id: result.id,
			kind: 'test',
			stage: 'provider-accepted',
			providerAcceptedAt: 20_000
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

	it('records owned worker and display receipts idempotently', async () => {
		const db = createTestDb();
		const userId = db.select({ id: users.id }).from(users).get()!.id;
		const service = createTimerAlertService({
			repository: createTimerAlertRepository(db),
			send: async () => ({ outcome: 'sent' }),
			publicKey: 'public-vapid-key',
			now: () => new Date(20_000)
		});
		const subscription = service.subscribe(userId, {
			endpoint: 'https://fcm.googleapis.com/fcm/send/receipt-subscription',
			keys: { p256dh: `B${'A'.repeat(86)}`, auth: 'A'.repeat(22) }
		});
		const test = await service.sendTest(userId, subscription.id);

		expect(
			service.recordReceipt(userId, test.id, {
				event: 'worker-received',
				occurredAt: 21_000
			})
		).toMatchObject({ accepted: true });
		service.recordReceipt(userId, test.id, {
			event: 'worker-received',
			occurredAt: 22_000
		});
		service.recordReceipt(userId, test.id, {
			event: 'notification-shown',
			occurredAt: 23_000
		});

		expect(service.getStatus(userId, test.id)).toMatchObject({
			stage: 'notification-shown',
			workerReceivedAt: 21_000,
			notificationShownAt: 23_000
		});
		expect(() =>
			service.recordReceipt(userId + 1, test.id, {
				event: 'clicked',
				occurredAt: 24_000
			})
		).toThrow('Timer alert job not found');
	});

	it('records a failed test when the sender throws unexpectedly', async () => {
		const db = createTestDb();
		const userId = db.select({ id: users.id }).from(users).get()!.id;
		const repository = createTimerAlertRepository(db);
		const service = createTimerAlertService({
			repository,
			send: async () => {
				throw new Error('push transport crashed');
			},
			publicKey: 'public-vapid-key',
			now: () => new Date(20_000)
		});
		const subscription = service.subscribe(userId, {
			endpoint: 'https://fcm.googleapis.com/fcm/send/throwing-subscription',
			keys: { p256dh: `B${'A'.repeat(86)}`, auth: 'A'.repeat(22) }
		});

		await expect(service.sendTest(userId, subscription.id)).rejects.toEqual(
			new TimerAlertServiceError(
				'unavailable',
				'The test alert could not be accepted by the push service'
			)
		);
		const job = db.select().from(timerAlertJobs).get();
		expect(job).toMatchObject({
			state: 'failed',
			lastError: 'sender-error'
		});
	});
});
