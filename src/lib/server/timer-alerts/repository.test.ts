import { describe, expect, it } from 'vitest';
import { createTestDb } from '$lib/server/test_db';
import { users } from '$lib/server/db/schema';
import { createTimerAlertRepository } from './repository';

describe('timer alert repository', () => {
	it('claims each due timer at most once', () => {
		const db = createTestDb();
		const userId = db.select({ id: users.id }).from(users).get()!.id;
		const repository = createTimerAlertRepository(db);
		const subscription = repository.upsertSubscription({
			userId,
			endpoint: 'https://fcm.googleapis.com/fcm/send/test-subscription',
			p256dh: 'public-key',
			auth: 'auth-secret'
		});

		repository.schedule({
			id: 'ab3b655b-68a0-4317-863c-163c4f01f54d',
			userId,
			subscriptionId: subscription.id,
			deadline: new Date(20_000),
			title: 'TIMER',
			body: 'Stir the stew',
			navigate: '/recipes/bean-stew'
		});

		expect(repository.claimDue(new Date(19_999))).toEqual([]);
		expect(repository.claimDue(new Date(20_000))).toMatchObject([
			{
				id: 'ab3b655b-68a0-4317-863c-163c4f01f54d',
				endpoint: 'https://fcm.googleapis.com/fcm/send/test-subscription'
			}
		]);
		expect(repository.claimDue(new Date(20_001))).toEqual([]);
	});

	it('cancels only a job owned by the requesting user before it is claimed', () => {
		const db = createTestDb();
		const userId = db.select({ id: users.id }).from(users).get()!.id;
		const repository = createTimerAlertRepository(db);
		const subscription = repository.upsertSubscription({
			userId,
			endpoint: 'https://fcm.googleapis.com/fcm/send/cancel-subscription',
			p256dh: 'public-key',
			auth: 'auth-secret'
		});
		const id = 'd0680b76-d9ea-4b05-a476-b7478ad7229a';
		repository.schedule({
			id,
			userId,
			subscriptionId: subscription.id,
			deadline: new Date(20_000),
			title: 'TIMER',
			body: 'Drain the pasta',
			navigate: '/recipes/pasta'
		});

		expect(repository.cancel(userId + 1, id)).toBe(false);
		expect(repository.cancel(userId, id)).toBe(true);
		expect(repository.cancel(userId, id)).toBe(true);
		expect(repository.claimDue(new Date(20_000))).toEqual([]);
	});

	it('rotates an endpoint in place so already-armed timers use the new capability', () => {
		const db = createTestDb();
		const userId = db.select({ id: users.id }).from(users).get()!.id;
		const repository = createTimerAlertRepository(db);
		const oldEndpoint = 'https://fcm.googleapis.com/fcm/send/old-subscription';
		const subscription = repository.upsertSubscription({
			userId,
			endpoint: oldEndpoint,
			p256dh: 'old-public-key',
			auth: 'old-auth-secret'
		});
		repository.schedule({
			id: '4cced2aa-b70a-421e-b10b-5414a51cc75f',
			userId,
			subscriptionId: subscription.id,
			deadline: new Date(20_000),
			title: 'TIMER',
			body: 'Turn off the hob',
			navigate: '/recipes/soup'
		});

		const rotated = repository.upsertSubscription({
			userId,
			endpoint: 'https://fcm.googleapis.com/fcm/send/new-subscription',
			previousEndpoint: oldEndpoint,
			p256dh: 'new-public-key',
			auth: 'new-auth-secret'
		});

		expect(rotated.id).toBe(subscription.id);
		expect(repository.claimDue(new Date(20_000))).toMatchObject([
			{
				subscriptionId: subscription.id,
				endpoint: 'https://fcm.googleapis.com/fcm/send/new-subscription',
				p256dh: 'new-public-key',
				auth: 'new-auth-secret'
			}
		]);
	});
});
