// Shared message shapes for cook-mode timer ticks.

export type TimerWorkerInbound =
	| { type: 'subscribe'; id: string }
	| { type: 'unsubscribe'; id: string };

export type TimerWorkerOutbound = { type: 'tick'; t: number };
