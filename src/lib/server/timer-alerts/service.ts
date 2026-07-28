import type { TimerAlertRepository } from './repository';
import type { TimerAlertSender } from './scheduler';
import {
	SubscriptionBodySchema,
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

		async sendTest(userId: number, subscriptionId: string): Promise<{ accepted: true }> {
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
			const result = await send({
				id: crypto.randomUUID(),
				userId,
				subscriptionId,
				deadline: currentTime,
				title: 'Timer alerts are ready',
				body: 'This device can receive background timer notifications.',
				navigate: '/',
				attemptCount: 0,
				endpoint: subscription.endpoint,
				p256dh: subscription.p256dh,
				auth: subscription.auth
			});
			if (result.outcome === 'sent') return { accepted: true };
			if (result.outcome === 'gone') options.repository.removeSubscription(subscriptionId);
			throw new TimerAlertServiceError(
				'unavailable',
				'The test alert could not be accepted by the push service'
			);
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
