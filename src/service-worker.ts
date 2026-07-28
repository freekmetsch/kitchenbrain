/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';
import {
	buildTimerNotification,
	parseTimerAlertPushPayload,
	type TimerAlertPushPayload
} from '$lib/timer/notification';

declare const self: ServiceWorkerGlobalScope;

const CACHE = `hb-${version}`;
const ASSETS = [...build, ...files];

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
			const windowClients = await self.clients.matchAll({
				type: 'window',
				includeUncontrolled: true
			});
			const foregroundVisible = windowClients.some(
				(client) => 'visibilityState' in client && client.visibilityState === 'visible'
			);
			const notification = buildTimerNotification(payload, foregroundVisible);
			await self.registration.showNotification(notification.title, notification.options);
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
	event.waitUntil(
		(async () => {
			const destination = new URL(navigate, self.location.origin).href;
			const windowClients = await self.clients.matchAll({
				type: 'window',
				includeUncontrolled: true
			});
			const existing = windowClients.find((client) => new URL(client.url).origin === self.location.origin);
			if (existing && 'focus' in existing) {
				if ('navigate' in existing) await existing.navigate(destination);
				await existing.focus();
				return;
			}
			await self.clients.openWindow(destination);
		})()
	);
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
