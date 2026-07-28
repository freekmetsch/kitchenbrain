/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';
import {
	buildDeclarativeTimerNotification,
	buildTimerNotification,
	parseTimerAlertPushPayload,
	type TimerAlertPushPayload
} from '$lib/timer/notification';
import {
	createIndexedDbTimerReceiptAdapters,
	TimerReceiptOutbox,
	type TimerReceipt
} from '$lib/timer/receipt-outbox';

declare const self: ServiceWorkerGlobalScope;

const CACHE = `hb-${version}`;
const ASSETS = [...build, ...files];
const timerReceiptOutbox = new TimerReceiptOutbox(
	createIndexedDbTimerReceiptAdapters(sendTimerReceipt)
);

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((c) => c.addAll(ASSETS))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;
	event.respondWith(
		caches.match(event.request).then((cached) => cached ?? fetch(event.request))
	);
});

const FALLBACK_TIMER_PUSH: TimerAlertPushPayload = {
	web_push: 8030,
	mutable: true,
	notification: {
		title: 'Timer finished',
		body: 'Open the cooking view to continue.',
		navigate: '/',
		tag: 'cook-timer-fallback',
		renotify: false,
		silent: false,
		requireInteraction: true,
		timestamp: 0,
		data: { timerJobId: 'fallback', navigate: '/' }
	}
};

self.addEventListener('push', (event) => {
	event.waitUntil(
		(async () => {
			const receiptTasks: Promise<void>[] = [
				timerReceiptOutbox.flush().catch(() => {})
			];
			const declarativeNotification = buildDeclarativeTimerNotification(
				(event as PushEvent & { readonly notification?: Notification | null }).notification
			);
			let notification = declarativeNotification;
			if (!notification) {
				let raw: unknown = null;
				try {
					raw = event.data?.json();
				} catch {
					// A visible generic timer notification is safer than a silent push failure.
				}
				const payload = parseTimerAlertPushPayload(raw) ?? {
					...FALLBACK_TIMER_PUSH,
					notification: {
						...FALLBACK_TIMER_PUSH.notification,
						timestamp: Date.now()
					}
				};
				notification = buildTimerNotification(payload);
			}
			const jobId = timerJobId(notification.options.data);
			if (jobId) {
				receiptTasks.push(
					timerReceiptOutbox.record({
						id: jobId,
						event: 'worker-received',
						occurredAt: Date.now()
					})
				);
			}
			try {
				await self.registration.showNotification(notification.title, notification.options);
				if (jobId) {
					receiptTasks.push(
						timerReceiptOutbox.record({
							id: jobId,
							event: 'notification-shown',
							occurredAt: Date.now()
						})
					);
				}
			} catch (cause) {
				if (jobId) {
					receiptTasks.push(
						timerReceiptOutbox.record({
							id: jobId,
							event: 'display-failed',
							occurredAt: Date.now(),
							errorCategory:
								cause instanceof DOMException && cause.name === 'NotAllowedError'
									? 'permission'
									: 'show-notification'
						})
					);
				}
				throw cause;
			} finally {
				await Promise.allSettled(receiptTasks);
			}
		})()
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const data = event.notification.data as { navigate?: unknown } | undefined;
	const navigate =
		typeof data?.navigate === 'string' &&
		(data.navigate === '/' || data.navigate.startsWith('/recipes/'))
			? data.navigate
			: '/';
	const jobId = timerJobId(data);
	const receipt = jobId
		? timerReceiptOutbox.record({
				id: jobId,
				event: 'clicked',
				occurredAt: Date.now()
			})
		: Promise.resolve();
	const navigation = (async () => {
		const destination = new URL(navigate, self.location.origin).href;
		const windowClients = await self.clients.matchAll({
			type: 'window',
			includeUncontrolled: true
		});
		const existing = windowClients.find(
			(client) => new URL(client.url).origin === self.location.origin
		);
		if (existing && 'focus' in existing) {
			try {
				await existing.focus();
				if ('navigate' in existing) {
					await existing.navigate(destination);
					return;
				}
			} catch {
				// A client loaded before this worker activated may reject navigation.
			}
		}
		await self.clients.openWindow(destination);
	})();
	event.waitUntil(Promise.allSettled([navigation, receipt]).then(() => undefined));
});

self.addEventListener('pushsubscriptionchange', (event) => {
	const change = event as ExtendableEvent & {
		oldSubscription?: PushSubscription | null;
		newSubscription?: PushSubscription | null;
	};
	event.waitUntil(
		(async () => {
			try {
				let subscription = change.newSubscription ?? null;
				if (!subscription) {
					const applicationServerKey =
						change.oldSubscription?.options.applicationServerKey ??
						(await readTimerAlertApplicationServerKey());
					if (applicationServerKey) {
						subscription = await self.registration.pushManager.subscribe({
							userVisibleOnly: true,
							applicationServerKey
						});
					}
				}
				if (subscription) {
					await persistChangedPushSubscription(
						subscription,
						change.oldSubscription?.endpoint
					);
				}
			} finally {
				const clients = await self.clients.matchAll({
					type: 'window',
					includeUncontrolled: true
				});
				for (const client of clients) {
					client.postMessage({ type: 'timer-push-subscription-changed' });
				}
			}
		})()
	);
});

async function readTimerAlertApplicationServerKey(): Promise<ArrayBuffer | null> {
	const response = await fetch(timerAlertApiUrl('readiness'), {
		credentials: 'same-origin'
	});
	if (!response.ok) return null;
	const value = (await response.json()) as { enabled?: unknown; publicKey?: unknown };
	if (value.enabled !== true || typeof value.publicKey !== 'string') return null;
	return base64UrlToBuffer(value.publicKey);
}

async function persistChangedPushSubscription(
	subscription: PushSubscription,
	previousEndpoint?: string
): Promise<void> {
	const serialized = subscription.toJSON();
	if (
		typeof serialized.endpoint !== 'string' ||
		typeof serialized.keys?.p256dh !== 'string' ||
		typeof serialized.keys.auth !== 'string'
	) {
		throw new Error('Changed Push subscription is incomplete');
	}
	const response = await fetch(timerAlertApiUrl('subscription'), {
		method: 'PUT',
		credentials: 'same-origin',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			endpoint: serialized.endpoint,
			keys: serialized.keys,
			...(previousEndpoint ? { previousEndpoint } : {})
		})
	});
	if (!response.ok) throw new Error('Changed Push subscription was not accepted');
}

function timerAlertApiUrl(path: string): string {
	return new URL(`api/timer-alerts/${path}`, self.registration.scope).href;
}

async function sendTimerReceipt(receipt: TimerReceipt): Promise<boolean> {
	const { id, event, occurredAt, errorCategory } = receipt;
	const response = await fetch(
		timerAlertApiUrl(`jobs/${encodeURIComponent(id)}/receipts`),
		{
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				event,
				occurredAt,
				...(errorCategory ? { errorCategory } : {})
			})
		}
	);
	if (response.ok) return true;
	return response.status === 400 || response.status === 404;
}

function timerJobId(value: unknown): string | null {
	if (value == null || typeof value !== 'object') return null;
	const id = (value as Record<string, unknown>).timerJobId;
	return typeof id === 'string' &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
		? id
		: null;
}

function base64UrlToBuffer(value: string): ArrayBuffer {
	const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
	const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
	const binary = atob(padded);
	const buffer = new ArrayBuffer(binary.length);
	const bytes = new Uint8Array(buffer);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return buffer;
}
