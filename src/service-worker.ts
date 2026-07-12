/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';
import type { ServiceWorkerFireMessage } from '$lib/timer/messages';

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

// Best-effort cook-mode timer notification. Verified §0 (FEATURE_LIST):
// SWs evict after ~30 s of idle, so this is NOT scheduled in advance — the
// main thread postMessages this handler at fire time (same frame as audio +
// vibrate) and we piggy-back on whatever life the SW has. Silent failure is
// acceptable because the primary alarm already fired from the cook view.

self.addEventListener('message', (event) => {
	const data = event.data as ServiceWorkerFireMessage | undefined;
	if (!data || data.type !== 'fire') return;
	void self.registration.showNotification(data.title, {
		body: data.body,
		vibrate: data.vibrate,
		requireInteraction: true,
		tag: `cook-timer-${data.id}`,
		renotify: true
	} as NotificationOptions & { vibrate?: number[]; renotify?: boolean });
});
