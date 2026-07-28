import { describe, expect, it, vi } from 'vitest';
import { createTestDb } from '$lib/server/test_db';
import { users } from '$lib/server/db/schema';
import { createTimerAlertRepository } from './repository';
import { createTimerAlertScheduler } from './scheduler';

describe('timer alert scheduler', () => {
	it('sends a due timer once and records only provider acceptance', async () => {
		const db = createTestDb();
		const userId = db.select({ id: users.id }).from(users).get()!.id;
		const repository = createTimerAlertRepository(db);
		const subscription = repository.upsertSubscription({
			userId,
			endpoint: 'https://fcm.googleapis.com/fcm/send/scheduler-subscription',
			p256dh: 'public-key',
			auth: 'auth-secret'
		});
		const id = '4bb16cdf-f1bb-48c7-85dd-c6a86aeb01b4';
		repository.schedule({
			id,
			userId,
			subscriptionId: subscription.id,
			deadline: new Date(20_000),
			title: 'TIMER',
			body: 'Turn off the oven',
			navigate: '/recipes/roast'
		});
		const send = vi.fn(async () => ({ outcome: 'sent' as const }));
		const scheduler = createTimerAlertScheduler({
			repository,
			send,
			now: () => new Date(20_000)
		});

		await expect(scheduler.runOnce()).resolves.toEqual({
			sent: 1,
			retried: 0,
			failed: 0,
			expired: 0
		});
		await scheduler.runOnce();

		expect(send).toHaveBeenCalledOnce();
		expect(repository.getJob(userId, id)).toMatchObject({
			state: 'sent',
			sentAt: new Date(20_000)
		});
	});

	it('expires a stale timer instead of alerting late', async () => {
		const db = createTestDb();
		const userId = db.select({ id: users.id }).from(users).get()!.id;
		const repository = createTimerAlertRepository(db);
		const subscription = repository.upsertSubscription({
			userId,
			endpoint: 'https://fcm.googleapis.com/fcm/send/stale-subscription',
			p256dh: 'public-key',
			auth: 'auth-secret'
		});
		const id = '5724a07d-f0d4-4f08-8814-6614bd59ce50';
		repository.schedule({
			id,
			userId,
			subscriptionId: subscription.id,
			deadline: new Date(20_000),
			title: 'TIMER',
			body: 'Remove the eggs',
			navigate: '/recipes/eggs'
		});
		const send = vi.fn(async () => ({ outcome: 'sent' as const }));
		const scheduler = createTimerAlertScheduler({
			repository,
			send,
			now: () => new Date(80_001),
			staleGraceMs: 60_000
		});

		await expect(scheduler.runOnce()).resolves.toMatchObject({ sent: 0, expired: 1 });
		expect(send).not.toHaveBeenCalled();
		expect(repository.getJob(userId, id)).toMatchObject({ state: 'expired' });
	});

	it('recovers an in-flight claim after a process restart', async () => {
		const db = createTestDb();
		const userId = db.select({ id: users.id }).from(users).get()!.id;
		const repository = createTimerAlertRepository(db);
		const subscription = repository.upsertSubscription({
			userId,
			endpoint: 'https://fcm.googleapis.com/fcm/send/restart-subscription',
			p256dh: 'public-key',
			auth: 'auth-secret'
		});
		const id = '742d185a-5c0d-4ae9-abf6-0389f6c78151';
		repository.schedule({
			id,
			userId,
			subscriptionId: subscription.id,
			deadline: new Date(20_000),
			title: 'TIMER',
			body: 'Check the bread',
			navigate: '/recipes/bread'
		});
		expect(repository.claimDue(new Date(20_000))).toHaveLength(1);

		const send = vi.fn(async () => ({ outcome: 'sent' as const }));
		const scheduler = createTimerAlertScheduler({
			repository,
			send,
			now: () => new Date(20_500)
		});

		expect(scheduler.recover()).toEqual({ recovered: 1, expired: 0 });
		await scheduler.runOnce();

		expect(send).toHaveBeenCalledOnce();
		expect(repository.getJob(userId, id)).toMatchObject({ state: 'sent' });
	});

	it('retries a transient provider failure inside the stale window', async () => {
		const db = createTestDb();
		const userId = db.select({ id: users.id }).from(users).get()!.id;
		const repository = createTimerAlertRepository(db);
		const subscription = repository.upsertSubscription({
			userId,
			endpoint: 'https://fcm.googleapis.com/fcm/send/retry-subscription',
			p256dh: 'public-key',
			auth: 'auth-secret'
		});
		const id = '52d36ff8-74c9-430b-a5bc-7b0fce81107e';
		repository.schedule({
			id,
			userId,
			subscriptionId: subscription.id,
			deadline: new Date(20_000),
			title: 'TIMER',
			body: 'Flip the pancakes',
			navigate: '/recipes/pancakes'
		});
		let now = new Date(20_000);
		const send = vi
			.fn()
			.mockResolvedValueOnce({ outcome: 'retry' as const, category: 'network' })
			.mockResolvedValueOnce({ outcome: 'sent' as const });
		const scheduler = createTimerAlertScheduler({
			repository,
			send,
			now: () => now,
			retryDelaysMs: [1_000]
		});

		await expect(scheduler.runOnce()).resolves.toMatchObject({ retried: 1, sent: 0 });
		expect(repository.getJob(userId, id)).toMatchObject({ state: 'scheduled' });
		await scheduler.runOnce();
		expect(send).toHaveBeenCalledOnce();

		now = new Date(21_000);
		await expect(scheduler.runOnce()).resolves.toMatchObject({ retried: 0, sent: 1 });
		expect(send).toHaveBeenCalledTimes(2);
		expect(repository.getJob(userId, id)).toMatchObject({ state: 'sent' });
	});

	it('prunes a subscription rejected as gone by the push service', async () => {
		const db = createTestDb();
		const userId = db.select({ id: users.id }).from(users).get()!.id;
		const repository = createTimerAlertRepository(db);
		const subscription = repository.upsertSubscription({
			userId,
			endpoint: 'https://fcm.googleapis.com/fcm/send/gone-subscription',
			p256dh: 'public-key',
			auth: 'auth-secret'
		});
		const id = '21da2e27-b439-4ec9-947c-c30351577ff2';
		repository.schedule({
			id,
			userId,
			subscriptionId: subscription.id,
			deadline: new Date(20_000),
			title: 'TIMER',
			body: 'Take out the tray',
			navigate: '/recipes/traybake'
		});
		const scheduler = createTimerAlertScheduler({
			repository,
			send: async () => ({ outcome: 'gone' }),
			now: () => new Date(20_000)
		});

		await expect(scheduler.runOnce()).resolves.toMatchObject({ failed: 1 });
		expect(repository.getJob(userId, id)).toBeUndefined();
	});
});
