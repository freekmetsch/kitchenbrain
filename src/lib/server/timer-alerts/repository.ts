import { and, count, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import { pushSubscriptions, timerAlertJobs } from '$lib/server/db/schema';
import type { Db } from '$lib/server/db/types';

export type PushSubscriptionInput = {
	userId: number;
	endpoint: string;
	p256dh: string;
	auth: string;
	previousEndpoint?: string | null;
	deviceLabel?: string | null;
};

export type TimerAlertScheduleInput = {
	id: string;
	userId: number;
	subscriptionId: string;
	deadline: Date;
	title: string;
	body: string;
	navigate: string;
};

export type TimerAlertReceiptEvent =
	| 'worker-received'
	| 'notification-shown'
	| 'display-failed'
	| 'clicked';

export type ClaimedTimerAlert = {
	id: string;
	userId: number;
	subscriptionId: string;
	deadline: Date;
	title: string;
	body: string;
	navigate: string;
	attemptCount: number;
	endpoint: string;
	p256dh: string;
	auth: string;
};

export function createTimerAlertRepository(db: Db) {
	return {
		upsertSubscription(input: PushSubscriptionInput): { id: string } {
			return db.transaction((tx) => {
				const now = new Date();
				const previous =
					input.previousEndpoint && input.previousEndpoint !== input.endpoint
						? tx
								.select({ id: pushSubscriptions.id })
								.from(pushSubscriptions)
								.where(
									and(
										eq(pushSubscriptions.endpoint, input.previousEndpoint),
										eq(pushSubscriptions.userId, input.userId)
									)
								)
								.get()
						: null;
				const existing = tx
					.select({ id: pushSubscriptions.id, userId: pushSubscriptions.userId })
					.from(pushSubscriptions)
					.where(eq(pushSubscriptions.endpoint, input.endpoint))
					.get();
				if (previous && (!existing || existing.id === previous.id)) {
					tx.update(pushSubscriptions)
						.set({
							endpoint: input.endpoint,
							p256dh: input.p256dh,
							auth: input.auth,
							deviceLabel: input.deviceLabel ?? null,
							updatedAt: now,
							lastUsedAt: now
						})
						.where(eq(pushSubscriptions.id, previous.id))
						.run();
					return { id: previous.id };
				}
				if (previous && existing && existing.id !== previous.id) {
					if (existing.userId !== input.userId) {
						tx.delete(timerAlertJobs)
							.where(eq(timerAlertJobs.subscriptionId, existing.id))
							.run();
						tx.update(pushSubscriptions)
							.set({ userId: input.userId })
							.where(eq(pushSubscriptions.id, existing.id))
							.run();
					}
					tx.update(timerAlertJobs)
						.set({ subscriptionId: existing.id, updatedAt: now })
						.where(
							and(
								eq(timerAlertJobs.subscriptionId, previous.id),
								eq(timerAlertJobs.userId, input.userId)
							)
						)
						.run();
					tx.delete(pushSubscriptions).where(eq(pushSubscriptions.id, previous.id)).run();
					tx.update(pushSubscriptions)
						.set({
							p256dh: input.p256dh,
							auth: input.auth,
							deviceLabel: input.deviceLabel ?? null,
							updatedAt: now,
							lastUsedAt: now
						})
						.where(eq(pushSubscriptions.id, existing.id))
						.run();
					return { id: existing.id };
				}
				if (existing) {
					if (existing.userId !== input.userId) {
						// Rebinding a browser capability to another household user
						// must not retain any prior owner's timer content, and the
						// composite ownership FK prevents changing the owner first.
						tx.delete(timerAlertJobs)
							.where(eq(timerAlertJobs.subscriptionId, existing.id))
							.run();
					}
					tx.update(pushSubscriptions)
						.set({
							userId: input.userId,
							p256dh: input.p256dh,
							auth: input.auth,
							deviceLabel: input.deviceLabel ?? null,
							updatedAt: now,
							lastUsedAt: now
						})
						.where(eq(pushSubscriptions.id, existing.id))
						.run();
					return { id: existing.id };
				}

				const id = crypto.randomUUID();
				tx.insert(pushSubscriptions)
					.values({
						id,
						userId: input.userId,
						endpoint: input.endpoint,
						p256dh: input.p256dh,
						auth: input.auth,
						deviceLabel: input.deviceLabel ?? null,
						createdAt: now,
						updatedAt: now,
						lastUsedAt: now
					})
					.run();
				return { id };
			});
		},

		schedule(input: TimerAlertScheduleInput): { id: string; state: string } {
			return db.transaction((tx) => {
				const subscription = tx
					.select({ id: pushSubscriptions.id })
					.from(pushSubscriptions)
					.where(
						and(
							eq(pushSubscriptions.id, input.subscriptionId),
							eq(pushSubscriptions.userId, input.userId)
						)
					)
					.get();
				if (!subscription) throw new Error('Timer alert subscription not found');

				const existing = tx
					.select({ id: timerAlertJobs.id, userId: timerAlertJobs.userId, state: timerAlertJobs.state })
					.from(timerAlertJobs)
					.where(eq(timerAlertJobs.id, input.id))
					.get();
				if (existing) {
					if (existing.userId !== input.userId) throw new Error('Timer alert job not found');
					return { id: existing.id, state: existing.state };
				}

				const now = new Date();
				tx.insert(timerAlertJobs)
					.values({
						...input,
						kind: 'timer',
						state: 'scheduled',
						attemptCount: 0,
						nextAttemptAt: input.deadline,
						createdAt: now,
						updatedAt: now
					})
					.run();
				tx.update(pushSubscriptions)
					.set({ lastUsedAt: now, updatedAt: now })
					.where(eq(pushSubscriptions.id, input.subscriptionId))
					.run();
				return { id: input.id, state: 'scheduled' };
			});
		},

		createTest(input: TimerAlertScheduleInput): void {
			const now = input.deadline;
			db.insert(timerAlertJobs)
				.values({
					...input,
					kind: 'test',
					state: 'claimed',
					attemptCount: 0,
					nextAttemptAt: now,
					claimedAt: now,
					createdAt: now,
					updatedAt: now
				})
				.run();
		},

		cancel(userId: number, id: string): boolean {
			return db.transaction((tx) => {
				const job = tx
					.select({ state: timerAlertJobs.state })
					.from(timerAlertJobs)
					.where(and(eq(timerAlertJobs.id, id), eq(timerAlertJobs.userId, userId)))
					.get();
				if (!job) return false;
				if (job.state === 'scheduled' || job.state === 'claimed') {
					tx.update(timerAlertJobs)
						.set({ state: 'cancelled', updatedAt: new Date() })
						.where(and(eq(timerAlertJobs.id, id), eq(timerAlertJobs.userId, userId)))
						.run();
				}
				return true;
			});
		},

		getJob(userId: number, id: string) {
			return db
				.select({
					id: timerAlertJobs.id,
					kind: timerAlertJobs.kind,
					state: timerAlertJobs.state,
					deadline: timerAlertJobs.deadline,
					providerAcceptedAt: timerAlertJobs.providerAcceptedAt,
					workerReceivedAt: timerAlertJobs.workerReceivedAt,
					notificationShownAt: timerAlertJobs.notificationShownAt,
					displayFailedAt: timerAlertJobs.displayFailedAt,
					displayError: timerAlertJobs.displayError,
					clickedAt: timerAlertJobs.clickedAt,
					lastError: timerAlertJobs.lastError
				})
				.from(timerAlertJobs)
				.where(and(eq(timerAlertJobs.id, id), eq(timerAlertJobs.userId, userId)))
				.get();
		},

		getSubscription(userId: number, id: string) {
			return db
				.select({
					id: pushSubscriptions.id,
					userId: pushSubscriptions.userId,
					endpoint: pushSubscriptions.endpoint,
					p256dh: pushSubscriptions.p256dh,
					auth: pushSubscriptions.auth
				})
				.from(pushSubscriptions)
				.where(and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, userId)))
				.get();
		},

		findSubscriptionByEndpoint(userId: number, endpoint: string) {
			return db
				.select({ id: pushSubscriptions.id })
				.from(pushSubscriptions)
				.where(
					and(
						eq(pushSubscriptions.userId, userId),
						eq(pushSubscriptions.endpoint, endpoint)
					)
				)
				.get();
		},

		countSubscriptions(userId: number): number {
			return (
				db
					.select({ value: count() })
					.from(pushSubscriptions)
					.where(eq(pushSubscriptions.userId, userId))
					.get()?.value ?? 0
			);
		},

		countActiveJobs(userId: number): number {
			return (
				db
					.select({ value: count() })
					.from(timerAlertJobs)
					.where(
						and(
							eq(timerAlertJobs.userId, userId),
							inArray(timerAlertJobs.state, ['scheduled', 'claimed'])
						)
					)
					.get()?.value ?? 0
			);
		},

		removeOwnedSubscription(userId: number, id: string): boolean {
			return (
				db
					.delete(pushSubscriptions)
					.where(and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, userId)))
					.run().changes > 0
			);
		},

		expireStale(now: Date, staleGraceMs: number): number {
			const cutoff = new Date(now.getTime() - staleGraceMs);
			return db
				.update(timerAlertJobs)
				.set({ state: 'expired', updatedAt: now, lastError: 'stale' })
				.where(
					and(
						inArray(timerAlertJobs.state, ['scheduled', 'claimed']),
						lte(timerAlertJobs.deadline, cutoff)
					)
				)
				.run().changes;
		},

		failInterruptedTests(now: Date): number {
			return db
				.update(timerAlertJobs)
				.set({
					state: 'failed',
					updatedAt: now,
					lastError: 'process-restart'
				})
				.where(
					and(
						eq(timerAlertJobs.kind, 'test'),
						eq(timerAlertJobs.state, 'claimed')
					)
				)
				.run().changes;
		},

		pruneTestEvidence(now: Date, retentionMs: number): number {
			const cutoff = new Date(now.getTime() - retentionMs);
			return db
				.delete(timerAlertJobs)
				.where(
					and(
						eq(timerAlertJobs.kind, 'test'),
						inArray(timerAlertJobs.state, ['sent', 'failed', 'expired', 'cancelled']),
						lte(timerAlertJobs.createdAt, cutoff)
					)
				)
				.run().changes;
		},

		recoverClaimed(now: Date, staleGraceMs: number): number {
			const cutoff = new Date(now.getTime() - staleGraceMs);
			return db
				.update(timerAlertJobs)
				.set({
					state: 'scheduled',
					nextAttemptAt: now,
					claimedAt: null,
					updatedAt: now,
					lastError: 'process-restart'
				})
				.where(
					and(
						eq(timerAlertJobs.state, 'claimed'),
						eq(timerAlertJobs.kind, 'timer'),
						gt(timerAlertJobs.deadline, cutoff)
					)
				)
				.run().changes;
		},

		claimDue(now: Date, limit = 25): ClaimedTimerAlert[] {
			return db.transaction((tx) => {
				const dueIds = tx
					.select({ id: timerAlertJobs.id })
					.from(timerAlertJobs)
					.where(
						and(
							eq(timerAlertJobs.state, 'scheduled'),
							eq(timerAlertJobs.kind, 'timer'),
							lte(timerAlertJobs.nextAttemptAt, now)
						)
					)
					.orderBy(timerAlertJobs.nextAttemptAt)
					.limit(limit)
					.all()
					.map((row) => row.id);
				if (dueIds.length === 0) return [];

				tx.update(timerAlertJobs)
					.set({
						state: 'claimed',
						claimedAt: now,
						updatedAt: now
					})
					.where(
						and(
							inArray(timerAlertJobs.id, dueIds),
							eq(timerAlertJobs.state, 'scheduled')
						)
					)
					.run();

				return tx
					.select({
						id: timerAlertJobs.id,
						userId: timerAlertJobs.userId,
						subscriptionId: timerAlertJobs.subscriptionId,
						deadline: timerAlertJobs.deadline,
						title: timerAlertJobs.title,
						body: timerAlertJobs.body,
						navigate: timerAlertJobs.navigate,
						attemptCount: timerAlertJobs.attemptCount,
						endpoint: pushSubscriptions.endpoint,
						p256dh: pushSubscriptions.p256dh,
						auth: pushSubscriptions.auth
					})
					.from(timerAlertJobs)
					.innerJoin(
						pushSubscriptions,
						eq(timerAlertJobs.subscriptionId, pushSubscriptions.id)
					)
					.where(
						and(
							inArray(timerAlertJobs.id, dueIds),
							eq(timerAlertJobs.state, 'claimed')
						)
					)
					.all();
			});
		},

		markProviderAccepted(id: string, now: Date): void {
			db.update(timerAlertJobs)
				.set({
					state: 'sent',
					providerAcceptedAt: now,
					updatedAt: now,
					lastError: null
				})
				.where(and(eq(timerAlertJobs.id, id), eq(timerAlertJobs.state, 'claimed')))
				.run();
		},

		recordReceipt(
			userId: number,
			id: string,
			event: TimerAlertReceiptEvent,
			occurredAt: Date,
			errorCategory?: string
		): boolean {
			const owned = db
				.select({ id: timerAlertJobs.id })
				.from(timerAlertJobs)
				.where(and(eq(timerAlertJobs.id, id), eq(timerAlertJobs.userId, userId)))
				.get();
			if (!owned) return false;
			const updatedAt = new Date();
			if (event === 'worker-received') {
				db.update(timerAlertJobs)
					.set({ workerReceivedAt: occurredAt, updatedAt })
					.where(
						and(
							eq(timerAlertJobs.id, id),
							eq(timerAlertJobs.userId, userId),
							isNull(timerAlertJobs.workerReceivedAt)
						)
					)
					.run();
			} else if (event === 'notification-shown') {
				db.update(timerAlertJobs)
					.set({ notificationShownAt: occurredAt, updatedAt })
					.where(
						and(
							eq(timerAlertJobs.id, id),
							eq(timerAlertJobs.userId, userId),
							isNull(timerAlertJobs.notificationShownAt)
						)
					)
					.run();
			} else if (event === 'display-failed') {
				db.update(timerAlertJobs)
					.set({
						displayFailedAt: occurredAt,
						displayError: errorCategory ?? 'unknown',
						updatedAt
					})
					.where(
						and(
							eq(timerAlertJobs.id, id),
							eq(timerAlertJobs.userId, userId),
							isNull(timerAlertJobs.displayFailedAt)
						)
					)
					.run();
			} else {
				db.update(timerAlertJobs)
					.set({ clickedAt: occurredAt, updatedAt })
					.where(
						and(
							eq(timerAlertJobs.id, id),
							eq(timerAlertJobs.userId, userId),
							isNull(timerAlertJobs.clickedAt)
						)
					)
					.run();
			}
			return true;
		},

		retry(id: string, now: Date, nextAttemptAt: Date, category: string): void {
			db.update(timerAlertJobs)
				.set({
					state: 'scheduled',
					attemptCount: sql`${timerAlertJobs.attemptCount} + 1`,
					nextAttemptAt,
					claimedAt: null,
					updatedAt: now,
					lastError: category
				})
				.where(and(eq(timerAlertJobs.id, id), eq(timerAlertJobs.state, 'claimed')))
				.run();
		},

		markFailed(id: string, now: Date, category: string): void {
			db.update(timerAlertJobs)
				.set({
					state: 'failed',
					attemptCount: sql`${timerAlertJobs.attemptCount} + 1`,
					updatedAt: now,
					lastError: category
				})
				.where(and(eq(timerAlertJobs.id, id), eq(timerAlertJobs.state, 'claimed')))
				.run();
		},

		removeSubscription(subscriptionId: string): void {
			db.delete(pushSubscriptions)
				.where(eq(pushSubscriptions.id, subscriptionId))
				.run();
		}
	};
}

export type TimerAlertRepository = ReturnType<typeof createTimerAlertRepository>;
