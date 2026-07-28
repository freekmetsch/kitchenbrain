import type { TimerAlertRepository } from './repository';
import type { TimerAlertSender } from './scheduler';
import {
	SubscriptionBodySchema,
	TimerAlertReceiptBodySchema,
	validateTimerAlertSchedule,
	type ValidTimerAlertSchedule
} from './validation';

export type TimerAlertServiceErrorCode =
	| 'not_found'
	| 'rate_limited'
	| 'unavailable'
	| 'invalid';

export class TimerAlertServiceError extends Error {
	constructor(
		readonly code: TimerAlertServiceErrorCode,
		message: string
	) {
		super(message);
		this.name = 'TimerAlertServiceError';
	}
}

type TimerAlertServiceOptions = {
	repository: TimerAlertRepository;
	send: TimerAlertSender | null;
	publicKey: string | null;
	now?: () => Date;
};

export function createTimerAlertService(options: TimerAlertServiceOptions) {
	const now = options.now ?? (() => new Date());
	const lastTestAt = new Map<number, number>();

	function requireSubscription(userId: number, subscriptionId: string) {
		const subscription = options.repository.getSubscription(userId, subscriptionId);
		if (!subscription) {
			throw new TimerAlertServiceError('not_found', 'Timer alert subscription not found');
		}
		return subscription;
	}

	function requireEnabled(): { send: TimerAlertSender; publicKey: string } {
		if (!options.send || !options.publicKey) {
			throw new TimerAlertServiceError('unavailable', 'Background timer alerts are unavailable');
		}
		return { send: options.send, publicKey: options.publicKey };
	}

	return {
		readiness() {
			return options.send && options.publicKey
				? { enabled: true as const, publicKey: options.publicKey }
				: { enabled: false as const, reason: 'server_unavailable' as const };
		},

		subscribe(userId: number, value: unknown): { id: string } {
			requireEnabled();
			const parsed = SubscriptionBodySchema.parse(value);
			const existing = options.repository.findSubscriptionByEndpoint(userId, parsed.endpoint);
			const previous = parsed.previousEndpoint
				? options.repository.findSubscriptionByEndpoint(userId, parsed.previousEndpoint)
				: null;
			if (!existing && !previous && options.repository.countSubscriptions(userId) >= 5) {
				throw new TimerAlertServiceError(
					'rate_limited',
					'Too many timer alert subscriptions'
				);
			}
			return options.repository.upsertSubscription({
				userId,
				endpoint: parsed.endpoint,
				p256dh: parsed.keys.p256dh,
				auth: parsed.keys.auth,
				previousEndpoint: parsed.previousEndpoint,
				deviceLabel: parsed.deviceLabel
			});
		},

		removeSubscription(userId: number, subscriptionId: string): boolean {
			return options.repository.removeOwnedSubscription(userId, subscriptionId);
		},

		async sendTest(
			userId: number,
			subscriptionId: string
		): Promise<{ id: string; stage: 'provider-accepted' }> {
			const { send } = requireEnabled();
			const subscription = requireSubscription(userId, subscriptionId);
			const currentTime = now();
			const previousTestAt = lastTestAt.get(userId);
			if (previousTestAt != null && currentTime.getTime() - previousTestAt < 30_000) {
				throw new TimerAlertServiceError(
					'rate_limited',
					'Wait before sending another test alert'
				);
			}
			lastTestAt.set(userId, currentTime.getTime());
			const id = crypto.randomUUID();
			const test = {
				id,
				userId,
				subscriptionId,
				deadline: currentTime,
				title: 'Timer test alert',
				body: 'If this notification made a sound, background timer alerts are working.',
				navigate: '/'
			};
			options.repository.createTest(test);
			let result: Awaited<ReturnType<TimerAlertSender>>;
			try {
				result = await send({
					...test,
					attemptCount: 0,
					endpoint: subscription.endpoint,
					p256dh: subscription.p256dh,
					auth: subscription.auth
				});
			} catch {
				options.repository.markFailed(id, currentTime, 'sender-error');
				throw new TimerAlertServiceError(
					'unavailable',
					'The test alert could not be accepted by the push service'
				);
			}
			if (result.outcome === 'sent') {
				options.repository.markProviderAccepted(id, currentTime);
				return { id, stage: 'provider-accepted' };
			}
			if (result.outcome === 'gone') options.repository.removeSubscription(subscriptionId);
			else {
				options.repository.markFailed(
					id,
					currentTime,
					result.outcome === 'failed' || result.outcome === 'retry'
						? result.category
						: 'gone'
				);
			}
			throw new TimerAlertServiceError(
				'unavailable',
				'The test alert could not be accepted by the push service'
			);
		},

		getStatus(userId: number, id: string) {
			const job = options.repository.getJob(userId, id);
			if (!job) {
				throw new TimerAlertServiceError('not_found', 'Timer alert job not found');
			}
			const stage =
				job.notificationShownAt != null
					? 'notification-shown'
					: job.displayFailedAt != null
						? 'display-failed'
						: job.workerReceivedAt != null
							? 'worker-received'
							: job.providerAcceptedAt != null
								? 'provider-accepted'
								: job.state === 'failed' || job.state === 'expired'
									? 'failed'
									: 'pending';
			return {
				id: job.id,
				kind: job.kind,
				stage,
				providerAcceptedAt: job.providerAcceptedAt?.getTime() ?? null,
				workerReceivedAt: job.workerReceivedAt?.getTime() ?? null,
				notificationShownAt: job.notificationShownAt?.getTime() ?? null,
				displayFailedAt: job.displayFailedAt?.getTime() ?? null,
				displayError: job.displayError,
				clickedAt: job.clickedAt?.getTime() ?? null
			};
		},

		recordReceipt(userId: number, id: string, value: unknown): { accepted: true } {
			if (!options.repository.getJob(userId, id)) {
				throw new TimerAlertServiceError('not_found', 'Timer alert job not found');
			}
			const receipt = TimerAlertReceiptBodySchema.parse(value);
			const currentTime = now().getTime();
			if (
				receipt.occurredAt < currentTime - 10 * 60_000 ||
				receipt.occurredAt > currentTime + 30_000
			) {
				throw new TimerAlertServiceError('invalid', 'Timer alert receipt timestamp is invalid');
			}
			options.repository.recordReceipt(
				userId,
				id,
				receipt.event,
				new Date(receipt.occurredAt),
				receipt.errorCategory
			);
			return { accepted: true };
		},

		schedule(userId: number, id: string, value: unknown) {
			requireEnabled();
			const schedule: ValidTimerAlertSchedule = validateTimerAlertSchedule(value, now());
			requireSubscription(userId, schedule.subscriptionId);
			if (
				!options.repository.getJob(userId, id) &&
				options.repository.countActiveJobs(userId) >= 50
			) {
				throw new TimerAlertServiceError('rate_limited', 'Too many active timer alerts');
			}
			return options.repository.schedule({
				id,
				userId,
				subscriptionId: schedule.subscriptionId,
				deadline: schedule.deadline,
				title: schedule.title,
				body: schedule.body,
				navigate: schedule.navigate
			});
		},

		cancel(userId: number, id: string): boolean {
			return options.repository.cancel(userId, id);
		}
	};
}

export type TimerAlertService = ReturnType<typeof createTimerAlertService>;
