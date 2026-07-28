import webpush from 'web-push';
import type { ClaimedTimerAlert } from './repository';
import type { TimerAlertSendResult, TimerAlertSender } from './scheduler';

export type TimerAlertVapidConfig = {
	publicKey: string;
	privateKey: string;
	subject: string;
};

type WebPushClient = Pick<typeof webpush, 'setVapidDetails' | 'sendNotification'>;

export function createWebPushSender(
	config: TimerAlertVapidConfig,
	client: WebPushClient = webpush
): TimerAlertSender {
	client.setVapidDetails(config.subject, config.publicKey, config.privateKey);

	return async (job: ClaimedTimerAlert): Promise<TimerAlertSendResult> => {
		const payload = JSON.stringify({
			web_push: 8030,
			mutable: true,
			notification: {
				title: job.title,
				body: job.body,
				navigate: job.navigate,
				tag: `cook-timer-${job.id}`,
				renotify: false,
				silent: false,
				requireInteraction: true,
				timestamp: job.deadline.getTime(),
				data: { timerJobId: job.id, navigate: job.navigate }
			}
		});
		try {
			await client.sendNotification(
				{
					endpoint: job.endpoint,
					keys: { p256dh: job.p256dh, auth: job.auth }
				},
				payload,
				{
					TTL: 60,
					urgency: 'high',
					topic: job.id.replaceAll('-', '').slice(0, 32)
				}
			);
			return { outcome: 'sent' };
		} catch (cause) {
			return classifyWebPushError(cause);
		}
	};
}

function classifyWebPushError(cause: unknown): TimerAlertSendResult {
	const statusCode =
		cause != null &&
		typeof cause === 'object' &&
		'statusCode' in cause &&
		typeof cause.statusCode === 'number'
			? cause.statusCode
			: null;
	if (statusCode === 404 || statusCode === 410) return { outcome: 'gone' };
	if (
		statusCode == null ||
		statusCode === 408 ||
		statusCode === 425 ||
		statusCode === 429 ||
		statusCode >= 500
	) {
		return { outcome: 'retry', category: statusCode == null ? 'network' : `push-${statusCode}` };
	}
	return { outcome: 'failed', category: `push-${statusCode}` };
}
