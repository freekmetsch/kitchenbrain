import { describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';
import { createWebPushSender } from './push';

describe('Web Push timer sender', () => {
	it('loads the CommonJS production client through its default export', () => {
		const vapid = webpush.generateVAPIDKeys();

		expect(() =>
			createWebPushSender({
				...vapid,
				subject: 'https://example.com'
			})
		).not.toThrow();
	});

	it('sends an encrypted declarative notification with timer-safe delivery options', async () => {
		const setVapidDetails = vi.fn();
		const sendNotification = vi.fn(async () => ({
			statusCode: 201,
			headers: {},
			body: ''
		}));
		const send = createWebPushSender(
			{
				publicKey: 'public-vapid-key',
				privateKey: 'private-vapid-key',
				subject: 'mailto:timers@example.com'
			},
			{ setVapidDetails, sendNotification }
		);

		await expect(
			send({
				id: '4bb16cdf-f1bb-48c7-85dd-c6a86aeb01b4',
				userId: 1,
				subscriptionId: 'subscription-id',
				deadline: new Date(20_000),
				title: 'TIMER',
				body: 'Turn off the oven',
				navigate: '/recipes/roast',
				attemptCount: 0,
				endpoint: 'https://fcm.googleapis.com/fcm/send/test',
				p256dh: 'p256dh',
				auth: 'auth'
			})
		).resolves.toEqual({ outcome: 'sent' });

		expect(setVapidDetails).toHaveBeenCalledWith(
			'mailto:timers@example.com',
			'public-vapid-key',
			'private-vapid-key'
		);
		expect(sendNotification).toHaveBeenCalledOnce();
		const [subscription, rawPayload, options] = sendNotification.mock.calls[0] as unknown as [
			unknown,
			string,
			unknown
		];
		expect(subscription).toEqual({
			endpoint: 'https://fcm.googleapis.com/fcm/send/test',
			keys: { p256dh: 'p256dh', auth: 'auth' }
		});
		expect(JSON.parse(rawPayload)).toMatchObject({
			web_push: 8030,
			mutable: true,
			notification: {
				title: 'TIMER',
				body: 'Turn off the oven',
				navigate: '/recipes/roast',
				tag: 'cook-timer-4bb16cdf-f1bb-48c7-85dd-c6a86aeb01b4',
				renotify: false,
				silent: false
			}
		});
		expect(options).toMatchObject({
			TTL: 60,
			urgency: 'high',
			topic: '4bb16cdff1bb48c785ddc6a86aeb01b4'
		});
	});
});
