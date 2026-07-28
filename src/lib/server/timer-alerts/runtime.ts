import { db } from '$lib/server/db/index';
import { readTimerAlertVapidConfig } from './config';
import { createWebPushSender } from './push';
import { createTimerAlertRepository } from './repository';
import { createTimerAlertScheduler } from './scheduler';
import { createTimerAlertService } from './service';

const repository = createTimerAlertRepository(db);
const configResult = readTimerAlertVapidConfig();

let publicKey: string | null = null;
let sender: ReturnType<typeof createWebPushSender> | null = null;
if (configResult.enabled) {
	try {
		publicKey = configResult.config.publicKey;
		sender = createWebPushSender(configResult.config);
	} catch {
		console.error('[timer-alerts] VAPID configuration is invalid; background alerts disabled');
	}
}

export const timerAlertService = createTimerAlertService({
	repository,
	send: sender,
	publicKey
});

let schedulerStarted = false;

export function startTimerAlertScheduler(): void {
	if (schedulerStarted || !sender) return;
	schedulerStarted = true;
	const scheduler = createTimerAlertScheduler({ repository, send: sender });
	const recovery = scheduler.recover();
	if (recovery.recovered > 0 || recovery.expired > 0) {
		console.info(
			`[timer-alerts] startup recovered=${recovery.recovered} expired=${recovery.expired}`
		);
	}
	let running = false;
	const handle = setInterval(() => {
		if (running) return;
		running = true;
		void scheduler
			.runOnce()
			.then((result) => {
				if (result.sent || result.retried || result.failed || result.expired) {
					console.info(
						`[timer-alerts] sent=${result.sent} retried=${result.retried} failed=${result.failed} expired=${result.expired}`
					);
				}
			})
			.catch(() => {
				console.error('[timer-alerts] scheduler tick failed');
			})
			.finally(() => {
				running = false;
			});
	}, 1_000);
	handle.unref();
}
