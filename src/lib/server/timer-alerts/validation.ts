import { z } from 'zod';

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const SUPPORTED_PUSH_HOSTS = new Set([
	'fcm.googleapis.com',
	'updates.push.services.mozilla.com',
	'web.push.apple.com'
]);

export const SubscriptionBodySchema = z
	.object({
		endpoint: z.string().url().max(2_048),
		keys: z.object({
			p256dh: z.string().min(80).max(128).regex(BASE64URL),
			auth: z.string().min(16).max(64).regex(BASE64URL)
		}),
		previousEndpoint: z.string().url().max(2_048).optional(),
		deviceLabel: z.string().trim().min(1).max(80).optional()
	})
	.strict()
	.superRefine((value, context) => {
		const p256dh = Buffer.from(value.keys.p256dh, 'base64url');
		const auth = Buffer.from(value.keys.auth, 'base64url');
		if (p256dh.length !== 65 || p256dh[0] !== 4) {
			context.addIssue({
				code: 'custom',
				path: ['keys', 'p256dh'],
				message: 'Invalid Push encryption public key'
			});
		}
		if (auth.length !== 16) {
			context.addIssue({
				code: 'custom',
				path: ['keys', 'auth'],
				message: 'Invalid Push authentication secret'
			});
		}
		try {
			validateTimerAlertEndpoint(value.endpoint);
			if (value.previousEndpoint) validateTimerAlertEndpoint(value.previousEndpoint);
		} catch {
			context.addIssue({
				code: 'custom',
				path: [value.previousEndpoint ? 'previousEndpoint' : 'endpoint'],
				message: 'Unsupported push endpoint'
			});
		}
	});

export const TimerAlertScheduleBodySchema = z
	.object({
		subscriptionId: z.string().uuid(),
		deadline: z.number().int().nonnegative(),
		durationSeconds: z.number().int().min(1).max(12 * 60 * 60),
		title: z.string().trim().min(1).max(80),
		body: z.string().trim().min(1).max(180),
		navigate: z
			.string()
			.min(1)
			.max(300)
			.regex(/^\/recipes\/[A-Za-z0-9][A-Za-z0-9_-]*(?:[/?#][^\s]*)?$/)
	})
	.strict();

export const TimerAlertReceiptBodySchema = z
	.object({
		event: z.enum([
			'worker-received',
			'notification-shown',
			'display-failed',
			'clicked'
		]),
		occurredAt: z.number().int().nonnegative(),
		errorCategory: z.enum(['permission', 'show-notification', 'unknown']).optional()
	})
	.strict()
	.superRefine((value, context) => {
		if (value.event === 'display-failed' && !value.errorCategory) {
			context.addIssue({
				code: 'custom',
				path: ['errorCategory'],
				message: 'Display failures require an error category'
			});
		}
		if (value.event !== 'display-failed' && value.errorCategory) {
			context.addIssue({
				code: 'custom',
				path: ['errorCategory'],
				message: 'Only display failures accept an error category'
			});
		}
	});

export type ValidTimerAlertSchedule = Omit<
	z.infer<typeof TimerAlertScheduleBodySchema>,
	'deadline'
> & { deadline: Date };

export function validateTimerAlertEndpoint(endpoint: string): void {
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		throw new Error('Unsupported push endpoint');
	}
	const supportedHost =
		SUPPORTED_PUSH_HOSTS.has(url.hostname) || url.hostname.endsWith('.push.apple.com');
	if (
		url.protocol !== 'https:' ||
		!supportedHost ||
		url.username !== '' ||
		url.password !== '' ||
		(url.port !== '' && url.port !== '443') ||
		url.hash !== ''
	) {
		throw new Error('Unsupported push endpoint');
	}
}

export function validateTimerAlertSchedule(
	value: unknown,
	now = new Date()
): ValidTimerAlertSchedule {
	const parsed = TimerAlertScheduleBodySchema.parse(value);
	const expectedDeadline = now.getTime() + parsed.durationSeconds * 1_000;
	if (Math.abs(parsed.deadline - expectedDeadline) > 15_000) {
		throw new Error('Timer deadline does not match its duration');
	}
	return { ...parsed, deadline: new Date(parsed.deadline) };
}
