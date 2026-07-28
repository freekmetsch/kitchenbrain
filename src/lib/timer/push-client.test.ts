import { describe, expect, it, vi } from 'vitest';
import { createTimerPushClient } from './push-client';

describe('timer Push client', () => {
	it('enables alerts from a user gesture and schedules on that device subscription', async () => {
		let permission: NotificationPermission = 'default';
		const subscription = {
			endpoint: 'https://fcm.googleapis.com/fcm/send/client-subscription',
			toJSON: () => ({
				endpoint: 'https://fcm.googleapis.com/fcm/send/client-subscription',
				keys: { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) }
			})
		};
		let currentSubscription: typeof subscription | null = null;
		const subscribe = vi.fn(async () => {
			currentSubscription = subscription;
			return subscription;
		});
		const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const path = String(input);
			if (path.endsWith('/readiness')) {
				return Response.json({ enabled: true, publicKey: 'A'.repeat(87) });
			}
			if (path.endsWith('/subscription') && init?.method === 'PUT') {
				return Response.json({ id: '0f0498c4-4bb6-4851-90fe-877f29b754b4' });
			}
			if (path.includes('/jobs/') && init?.method === 'PUT') {
				return Response.json({ id: path.split('/').at(-1), state: 'scheduled' });
			}
			return new Response(null, { status: 404 });
		});
		const client = createTimerPushClient({
			fetch,
			notificationPermission: () => permission,
			requestNotificationPermission: async () => {
				permission = 'granted';
				return permission;
			},
			isIos: () => false,
			isStandalone: () => false,
			getSubscription: async () => currentSubscription,
			subscribe,
			deviceLabel: () => 'Kitchen phone'
		});

		await expect(client.inspect()).resolves.toMatchObject({ status: 'permission-needed' });
		await expect(client.enable()).resolves.toMatchObject({
			status: 'ready',
			subscriptionId: '0f0498c4-4bb6-4851-90fe-877f29b754b4'
		});
		await expect(
			client.schedule({
				id: '4bb16cdf-f1bb-48c7-85dd-c6a86aeb01b4',
				deadline: 80_000,
				durationSeconds: 60,
				title: 'TIMER',
				body: 'Turn off the oven',
				navigate: '/recipes/roast'
			})
		).resolves.toEqual({ status: 'armed' });
		expect(subscribe).toHaveBeenCalledOnce();
		expect(fetch).toHaveBeenCalledWith(
			'/api/timer-alerts/jobs/4bb16cdf-f1bb-48c7-85dd-c6a86aeb01b4',
			expect.objectContaining({ method: 'PUT' })
		);
	});

	it('recreates a missing subscription when notification permission was already granted', async () => {
		const subscription = {
			endpoint: 'https://fcm.googleapis.com/fcm/send/recreated-subscription',
			toJSON: () => ({
				endpoint: 'https://fcm.googleapis.com/fcm/send/recreated-subscription',
				keys: { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) }
			})
		};
		const subscribe = vi.fn(async () => subscription);
		const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			if (String(input).endsWith('/readiness')) {
				return Response.json({ enabled: true, publicKey: 'A'.repeat(87) });
			}
			if (String(input).endsWith('/subscription') && init?.method === 'PUT') {
				return Response.json({ id: '5b063156-fe5e-452f-a67f-82935fb3a3e6' });
			}
			return new Response(null, { status: 404 });
		});
		const client = createTimerPushClient({
			fetch,
			notificationPermission: () => 'granted',
			requestNotificationPermission: async () => 'granted',
			isIos: () => false,
			isStandalone: () => false,
			getSubscription: async () => null,
			subscribe,
			deviceLabel: () => 'Kitchen phone'
		});

		await expect(client.inspect()).resolves.toEqual({
			status: 'ready',
			subscriptionId: '5b063156-fe5e-452f-a67f-82935fb3a3e6'
		});
		expect(subscribe).toHaveBeenCalledOnce();
	});

	it('reports a test as successful only after this browser confirms notification display', async () => {
		const subscription = {
			endpoint: 'https://fcm.googleapis.com/fcm/send/test-subscription',
			toJSON: () => ({
				endpoint: 'https://fcm.googleapis.com/fcm/send/test-subscription',
				keys: { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) }
			})
		};
		let statusReads = 0;
		const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const path = String(input);
			if (path.endsWith('/readiness')) {
				return Response.json({ enabled: true, publicKey: 'A'.repeat(87) });
			}
			if (path.endsWith('/subscription') && init?.method === 'PUT') {
				return Response.json({ id: '5b063156-fe5e-452f-a67f-82935fb3a3e6' });
			}
			if (path.endsWith('/test') && init?.method === 'POST') {
				return Response.json({
					id: '4bb16cdf-f1bb-48c7-85dd-c6a86aeb01b4',
					stage: 'provider-accepted'
				});
			}
			if (path.includes('/jobs/') && init?.method == null) {
				statusReads += 1;
				return Response.json({
					id: '4bb16cdf-f1bb-48c7-85dd-c6a86aeb01b4',
					kind: 'test',
					stage: statusReads === 1 ? 'worker-received' : 'notification-shown'
				});
			}
			return new Response(null, { status: 404 });
		});
		const stages: string[] = [];
		const client = createTimerPushClient({
			fetch,
			notificationPermission: () => 'granted',
			requestNotificationPermission: async () => 'granted',
			isIos: () => false,
			isStandalone: () => false,
			getSubscription: async () => subscription,
			subscribe: async () => subscription,
			deviceLabel: () => 'Kitchen phone',
			sleep: async () => {}
		});
		await client.inspect();

		await expect(
			client.sendTest((result) => stages.push(result.stage))
		).resolves.toMatchObject({
			id: '4bb16cdf-f1bb-48c7-85dd-c6a86aeb01b4',
			stage: 'notification-shown'
		});
		expect(stages).toEqual([
			'provider-accepted',
			'worker-received',
			'notification-shown'
		]);
	});

	it('reports the Test cooldown when the server rate limit is active', async () => {
		const subscription = {
			endpoint: 'https://fcm.googleapis.com/fcm/send/rate-limited-subscription',
			toJSON: () => ({
				endpoint: 'https://fcm.googleapis.com/fcm/send/rate-limited-subscription',
				keys: { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) }
			})
		};
		const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const path = String(input);
			if (path.endsWith('/readiness')) {
				return Response.json({ enabled: true, publicKey: 'A'.repeat(87) });
			}
			if (path.endsWith('/subscription') && init?.method === 'PUT') {
				return Response.json({ id: '5b063156-fe5e-452f-a67f-82935fb3a3e6' });
			}
			return new Response(null, { status: 429 });
		});
		const client = createTimerPushClient({
			fetch,
			notificationPermission: () => 'granted',
			isIos: () => false,
			isStandalone: () => false,
			getSubscription: async () => subscription,
			deviceLabel: () => 'Kitchen phone'
		});
		await client.inspect();

		await expect(client.sendTest()).resolves.toEqual({ stage: 'rate-limited' });
	});

	it('reports an unconfirmed Test after the bounded display-status window', async () => {
		const subscription = {
			endpoint: 'https://fcm.googleapis.com/fcm/send/unconfirmed-subscription',
			toJSON: () => ({
				endpoint: 'https://fcm.googleapis.com/fcm/send/unconfirmed-subscription',
				keys: { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) }
			})
		};
		const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const path = String(input);
			if (path.endsWith('/readiness')) {
				return Response.json({ enabled: true, publicKey: 'A'.repeat(87) });
			}
			if (path.endsWith('/subscription') && init?.method === 'PUT') {
				return Response.json({ id: '5b063156-fe5e-452f-a67f-82935fb3a3e6' });
			}
			if (path.endsWith('/test') && init?.method === 'POST') {
				return Response.json({
					id: '4bb16cdf-f1bb-48c7-85dd-c6a86aeb01b4',
					stage: 'provider-accepted'
				});
			}
			return Response.json({ stage: 'worker-received' });
		});
		const sleep = vi.fn(async (_delayMs: number) => {});
		const stages: string[] = [];
		const client = createTimerPushClient({
			fetch,
			notificationPermission: () => 'granted',
			isIos: () => false,
			isStandalone: () => false,
			getSubscription: async () => subscription,
			deviceLabel: () => 'Kitchen phone',
			sleep
		});
		await client.inspect();

		await expect(
			client.sendTest((result) => stages.push(result.stage))
		).resolves.toMatchObject({
			id: '4bb16cdf-f1bb-48c7-85dd-c6a86aeb01b4',
			stage: 'unconfirmed'
		});
		expect(stages).toEqual(['provider-accepted', 'worker-received', 'unconfirmed']);
		expect(sleep).toHaveBeenCalledTimes(14);
		expect(
			sleep.mock.calls.reduce((total, [delay]) => total + delay, 0)
		).toBeGreaterThanOrEqual(60_000);
	});
});
