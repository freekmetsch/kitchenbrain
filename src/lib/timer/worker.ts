// Foreground-locked cook-mode timer tick. Runs in its own thread so the
// 250 ms tick keeps advancing under main-thread throttling (e.g. when the
// cook briefly switches apps). Subscribers send `{type:'subscribe', id}` to
// start ticks and `{type:'unsubscribe', id}` to stop. The worker keeps
// ticking only while at least one subscriber is registered, so an
// idle bench-sheet costs nothing.

/// <reference lib="webworker" />

import type { TimerWorkerInbound } from './messages';

const subscribers = new Set<string>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function ensureTicking(): void {
	if (intervalId != null) return;
	intervalId = setInterval(() => {
		(self as DedicatedWorkerGlobalScope).postMessage({ type: 'tick', t: Date.now() });
	}, 250);
}

function stopTicking(): void {
	if (intervalId == null) return;
	clearInterval(intervalId);
	intervalId = null;
}

self.addEventListener('message', (e: MessageEvent<TimerWorkerInbound>) => {
	const data = e.data;
	if (!data) return;
	if (data.type === 'subscribe') {
		subscribers.add(data.id);
		ensureTicking();
	} else if (data.type === 'unsubscribe') {
		subscribers.delete(data.id);
		if (subscribers.size === 0) stopTicking();
	}
});

export {};
