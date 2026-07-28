import { describe, expect, it } from 'vitest';
import {
	SubscriptionBodySchema,
	validateTimerAlertEndpoint,
	validateTimerAlertSchedule
} from './validation';

describe('timer alert request validation', () => {
	it('accepts browser push services and rejects arbitrary egress targets', () => {
		expect(() =>
			validateTimerAlertEndpoint('https://fcm.googleapis.com/fcm/send/subscription')
		).not.toThrow();
		expect(() =>
			validateTimerAlertEndpoint('https://web.push.apple.com/QP123')
		).not.toThrow();
		expect(() =>
			validateTimerAlertEndpoint('https://updates.push.services.mozilla.com/wpush/v2/test')
		).not.toThrow();

		for (const endpoint of [
			'http://fcm.googleapis.com/fcm/send/test',
			'https://127.0.0.1/push',
			'https://example.com/push',
			'https://user:password@fcm.googleapis.com/fcm/send/test',
			'https://fcm.googleapis.com:8443/fcm/send/test'
		]) {
			expect(() => validateTimerAlertEndpoint(endpoint)).toThrow('Unsupported push endpoint');
		}
	});

	it('validates subscription key shape before capability storage', () => {
		expect(
			SubscriptionBodySchema.safeParse({
				endpoint: 'https://fcm.googleapis.com/fcm/send/subscription',
				keys: {
					p256dh: `B${'A'.repeat(86)}`,
					auth: 'B'.repeat(22)
				},
				deviceLabel: 'Kitchen phone'
			}).success
		).toBe(true);
		expect(
			SubscriptionBodySchema.safeParse({
				endpoint: 'https://fcm.googleapis.com/fcm/send/subscription',
				keys: { p256dh: 'short', auth: 'short' }
			}).success
		).toBe(false);
	});

	it('keeps the client and server deadline aligned within bounded clock skew', () => {
		const now = new Date('2026-07-28T12:00:00.000Z');
		expect(
			validateTimerAlertSchedule(
				{
					subscriptionId: '0f0498c4-4bb6-4851-90fe-877f29b754b4',
					deadline: now.getTime() + 60_000,
					durationSeconds: 60,
					title: 'TIMER',
					body: 'Drain the pasta',
					navigate: '/recipes/pasta'
				},
				now
			)
		).toMatchObject({ deadline: new Date(now.getTime() + 60_000) });
		expect(() =>
			validateTimerAlertSchedule(
				{
					subscriptionId: '0f0498c4-4bb6-4851-90fe-877f29b754b4',
					deadline: now.getTime() + 3_600_000,
					durationSeconds: 60,
					title: 'TIMER',
					body: 'Drain the pasta',
					navigate: '/recipes/pasta'
				},
				now
			)
		).toThrow('Timer deadline does not match its duration');
	});
});
