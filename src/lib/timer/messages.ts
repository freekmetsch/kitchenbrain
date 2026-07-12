// Shared message shapes for the foreground-locked cook-mode timer.
// Imported by `lib/timer/worker.ts` (web worker), `service-worker.ts` (SW),
// and `lib/components/BenchSheet.svelte` (main thread) so the wire format
// stays in one place.

export type TimerWorkerInbound =
	| { type: 'subscribe'; id: string }
	| { type: 'unsubscribe'; id: string };

export type TimerWorkerOutbound = { type: 'tick'; t: number };

export type ServiceWorkerFireMessage = {
	type: 'fire';
	id: string;
	title: string;
	body: string;
	vibrate?: number[];
};
