import type { ClaimedTimerAlert, TimerAlertRepository } from './repository';
import {
	TIMER_ALERT_DELIVERY_WINDOW_MS,
	TIMER_TEST_RECEIPT_RETENTION_MS
} from './constants';

export type TimerAlertSendResult =
	| { outcome: 'sent' }
	| { outcome: 'gone' }
	| { outcome: 'failed'; category: string }
	| { outcome: 'retry'; category: string };

export type TimerAlertSender = (job: ClaimedTimerAlert) => Promise<TimerAlertSendResult>;

export type TimerAlertSchedulerResult = {
	sent: number;
	retried: number;
	failed: number;
	expired: number;
};

type TimerAlertSchedulerOptions = {
	repository: TimerAlertRepository;
	send: TimerAlertSender;
	now?: () => Date;
	staleGraceMs?: number;
	retryDelaysMs?: number[];
};

export function createTimerAlertScheduler(options: TimerAlertSchedulerOptions) {
	const now = options.now ?? (() => new Date());
	const staleGraceMs = options.staleGraceMs ?? TIMER_ALERT_DELIVERY_WINDOW_MS;
	const retryDelaysMs = options.retryDelaysMs ?? [1_000, 5_000, 15_000];
	let nextTestEvidencePruneAt = 0;

	function pruneTestEvidence(currentTime: Date): void {
		if (currentTime.getTime() < nextTestEvidencePruneAt) return;
		options.repository.pruneTestEvidence(currentTime, TIMER_TEST_RECEIPT_RETENTION_MS);
		nextTestEvidencePruneAt = currentTime.getTime() + 24 * 60 * 60_000;
	}

	return {
		recover(): { recovered: number; expired: number } {
			const recoveryTime = now();
			pruneTestEvidence(recoveryTime);
			options.repository.failInterruptedTests(recoveryTime);
			const expired = options.repository.expireStale(recoveryTime, staleGraceMs);
			const recovered = options.repository.recoverClaimed(recoveryTime, staleGraceMs);
			return { recovered, expired };
		},

		async runOnce(): Promise<TimerAlertSchedulerResult> {
			const result: TimerAlertSchedulerResult = {
				sent: 0,
				retried: 0,
				failed: 0,
				expired: 0
			};
			const tickTime = now();
			pruneTestEvidence(tickTime);
			result.expired = options.repository.expireStale(tickTime, staleGraceMs);
			const claimed = options.repository.claimDue(tickTime);
			for (const job of claimed) {
				let sendResult: TimerAlertSendResult;
				try {
					sendResult = await options.send(job);
				} catch {
					sendResult = { outcome: 'retry', category: 'sender-error' };
				}
				if (sendResult.outcome === 'sent') {
					options.repository.markProviderAccepted(job.id, now());
					result.sent += 1;
					continue;
				}
				if (sendResult.outcome === 'retry') {
					const retryTime = now();
					const delay =
						retryDelaysMs[Math.min(job.attemptCount, retryDelaysMs.length - 1)] ?? 0;
					const nextAttemptAt = new Date(retryTime.getTime() + delay);
					const staleAt = job.deadline.getTime() + staleGraceMs;
					if (delay > 0 && nextAttemptAt.getTime() <= staleAt) {
						options.repository.retry(
							job.id,
							retryTime,
							nextAttemptAt,
							sendResult.category
						);
						result.retried += 1;
					} else {
						options.repository.markFailed(job.id, retryTime, sendResult.category);
						result.failed += 1;
					}
					continue;
				}
				if (sendResult.outcome === 'gone') {
					options.repository.removeSubscription(job.subscriptionId);
					result.failed += 1;
					continue;
				}
				if (sendResult.outcome === 'failed') {
					options.repository.markFailed(job.id, now(), sendResult.category);
					result.failed += 1;
				}
			}
			return result;
		}
	};
}
