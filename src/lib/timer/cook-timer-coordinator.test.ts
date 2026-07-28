import { describe, expect, it, vi } from 'vitest';
import {
	CookTimerCoordinator,
	type CookTimerCoordinatorBrowserAdapters
} from './cook-timer-coordinator.svelte';

function browserAdapters() {
	let now = 1_000;
	let interval: (() => void) | undefined;
	const browser: CookTimerCoordinatorBrowserAdapters = {
		createWorker: () => {
			throw new Error('worker unavailable');
		},
		listenVisibility: () => () => {},
		visibilityState: () => 'visible',
		requestWakeLock: async () => null,
		createAudioContext: () => null,
		vibrate: vi.fn(),
		setInterval: (callback) => {
			interval = callback;
			return 1;
		},
		clearInterval: vi.fn(),
		now: () => now,
		warn: vi.fn()
	};
	return {
		browser,
		advanceTo(value: number) {
			now = value;
			interval?.();
		}
	};
}

function pushAdapters() {
	return {
		inspect: vi.fn(async () => ({ status: 'server-unavailable' as const })),
		enable: vi.fn(async () => ({ status: 'server-unavailable' as const })),
		sendTest: vi.fn(async () => ({ stage: 'failed' as const })),
		schedule: vi.fn(async () => ({ status: 'foreground-only' as const })),
		cancel: vi.fn(async () => ({ status: 'cancelled' as const }))
	};
}

describe('CookTimerCoordinator', () => {
	it('keeps a timer alive while its cooking route is detached', () => {
		const clock = browserAdapters();
		const coordinator = new CookTimerCoordinator({
			browser: clock.browser,
			storage: null,
			push: pushAdapters()
		});
		coordinator.mount();
		const session = coordinator.session({
			key: 'roast:direct',
			recipeSlug: 'roast',
			recipeTitle: 'Sunday roast'
		});

		session.start(0, 10, { label: 'OVEN · LEFT' });
		session.attachView(
			() => false,
			() => {}
		)();
		clock.advanceTo(11_000);

		const reattached = coordinator.session({
			key: 'roast:direct',
			recipeSlug: 'roast',
			recipeTitle: 'Sunday roast'
		});
		expect(reattached).toBe(session);
		expect(reattached.timers.snapshot.doneIdxs).toEqual(new Set([0]));
		expect(coordinator.visibleTimers).toMatchObject([
			{ recipeSlug: 'roast', recipeTitle: 'Sunday roast', label: 'OVEN · LEFT', done: true }
		]);

		coordinator.destroy();
	});

	it('restores the global timer registry before any cooking route mounts', () => {
		const values = new Map<string, string>();
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
			removeItem: (key: string) => values.delete(key)
		};
		const firstClock = browserAdapters();
		const first = new CookTimerCoordinator({
			browser: firstClock.browser,
			storage,
			push: pushAdapters()
		});
		first.mount();
		first
			.session({ key: 'soup:direct', recipeSlug: 'soup', recipeTitle: 'Tomato soup' })
			.start(2, 60, { label: 'STIR' });
		first.destroy();

		const restoredClock = browserAdapters();
		const restored = new CookTimerCoordinator({
			browser: restoredClock.browser,
			storage,
			push: pushAdapters()
		});

		expect(restored.visibleTimers).toMatchObject([
			{
				sessionKey: 'soup:direct',
				index: 2,
				recipeTitle: 'Tomato soup',
				label: 'STIR',
				done: false
			}
		]);
		restored.mount();
		restored.destroy();

		const reloaded = new CookTimerCoordinator({
			browser: browserAdapters().browser,
			storage,
			push: pushAdapters()
		});
		expect(reloaded.visibleTimers).toMatchObject([
			{ recipeTitle: 'Tomato soup', label: 'STIR', done: false }
		]);
		reloaded.destroy();
	});

	it('keeps failed reset cancellations pending for a later retry', async () => {
		const push = {
			...pushAdapters(),
			schedule: vi.fn(async () => ({ status: 'armed' as const })),
			cancel: vi.fn(async () => ({ status: 'cancel-pending' as const }))
		};
		const coordinator = new CookTimerCoordinator({
			browser: browserAdapters().browser,
			storage: null,
			push,
			uuid: () => '4bb16cdf-f1bb-48c7-85dd-c6a86aeb01b4'
		});
		const session = coordinator.session({
			key: 'roast:direct',
			recipeSlug: 'roast',
			recipeTitle: 'Sunday roast'
		});
		session.start(0, 60, {
			label: 'OVEN',
			title: 'OVEN',
			body: 'Remove the tray',
			navigate: '/recipes/roast'
		});
		await Promise.resolve();

		session.reset();
		await Promise.resolve();

		expect(session.timers.order).toEqual([]);
		expect(session.alerts[0]).toEqual({
			jobId: '4bb16cdf-f1bb-48c7-85dd-c6a86aeb01b4',
			status: 'cancel-pending'
		});
		coordinator.destroy();
	});

	it('skips one stale persisted session without discarding a live timer', () => {
		const values = new Map<string, string>([
			[
				'cook-timer-registry:v1',
				JSON.stringify({
					v: 1,
					sessions: [
						{
							key: 'stale:direct',
							recipeSlug: 'stale',
							recipeTitle: 'Stale recipe',
							ends: { 0: -400_000 },
							order: [0],
							metadata: { 0: { label: 'STALE' } },
							alerts: {}
						},
						{
							key: 'soup:direct',
							recipeSlug: 'soup',
							recipeTitle: 'Tomato soup',
							ends: { 1: 61_000 },
							order: [1],
							metadata: { 1: { label: 'STIR' } },
							alerts: {}
						}
					]
				})
			]
		]);
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
			removeItem: (key: string) => values.delete(key)
		};

		const coordinator = new CookTimerCoordinator({
			browser: browserAdapters().browser,
			storage,
			push: pushAdapters()
		});

		expect(coordinator.visibleTimers).toMatchObject([
			{ sessionKey: 'soup:direct', label: 'STIR', done: false }
		]);
		expect(JSON.parse(values.get('cook-timer-registry:v1')!).sessions).toHaveLength(1);
		coordinator.destroy();
	});

	it('reads only the configured household user storage key', () => {
		const values = new Map<string, string>([
			[
				'cook-timer-registry:1:v1',
				JSON.stringify({
					v: 1,
					sessions: [
						{
							key: 'private:direct',
							recipeSlug: 'private',
							recipeTitle: 'Other user recipe',
							ends: { 0: 61_000 },
							order: [0],
							metadata: { 0: { label: 'PRIVATE' } },
							alerts: {}
						}
					]
				})
			]
		]);
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
			removeItem: (key: string) => values.delete(key)
		};

		const coordinator = new CookTimerCoordinator({
			browser: browserAdapters().browser,
			storage,
			storageKey: 'cook-timer-registry:2:v1',
			push: pushAdapters()
		});

		expect(coordinator.visibleTimers).toEqual([]);
		expect(values.has('cook-timer-registry:1:v1')).toBe(true);
		coordinator.destroy();
	});

	it('does not let an older push inspection overwrite a newer enable result', async () => {
		let resolveInspect!: (value: { status: 'server-unavailable' }) => void;
		let resolveEnable!: (value: { status: 'ready'; subscriptionId: string }) => void;
		const inspectResult = new Promise<{ status: 'server-unavailable' }>((resolve) => {
			resolveInspect = resolve;
		});
		const enableResult = new Promise<{ status: 'ready'; subscriptionId: string }>(
			(resolve) => {
				resolveEnable = resolve;
			}
		);
		const coordinator = new CookTimerCoordinator({
			browser: browserAdapters().browser,
			storage: null,
			push: {
				...pushAdapters(),
				inspect: vi.fn(() => inspectResult),
				enable: vi.fn(() => enableResult)
			}
		});

		const inspection = coordinator.inspectPush();
		const enable = coordinator.enablePush();
		resolveEnable({ status: 'ready', subscriptionId: 'subscription-id' });
		await enable;
		resolveInspect({ status: 'server-unavailable' });
		await inspection;

		expect(coordinator.pushState).toEqual({
			status: 'ready',
			subscriptionId: 'subscription-id'
		});
		coordinator.destroy();
	});

	it('keeps the durable push job attached when a timer is cancelled outside Cook Mode', async () => {
		const clock = browserAdapters();
		const push = {
			inspect: vi.fn(),
			enable: vi.fn(),
			sendTest: vi.fn(),
			schedule: vi.fn(async () => ({ status: 'armed' as const })),
			cancel: vi.fn(async () => ({ status: 'cancelled' as const }))
		};
		const coordinator = new CookTimerCoordinator({
			browser: clock.browser,
			storage: null,
			push,
			uuid: () => '4bb16cdf-f1bb-48c7-85dd-c6a86aeb01b4'
		});
		coordinator.mount();
		const session = coordinator.session({
			key: 'roast:direct',
			recipeSlug: 'roast',
			recipeTitle: 'Sunday roast'
		});

		session.start(0, 10, {
			label: 'OVEN · LEFT',
			title: 'OVEN · LEFT',
			body: 'Remove the tray',
			navigate: '/recipes/roast'
		});
		await Promise.resolve();
		expect(session.alerts[0]).toEqual({
			jobId: '4bb16cdf-f1bb-48c7-85dd-c6a86aeb01b4',
			status: 'armed'
		});

		session.attachView(
			() => false,
			() => {}
		)();
		coordinator.cancel('roast:direct', 0);
		await Promise.resolve();

		expect(push.cancel).toHaveBeenCalledWith('4bb16cdf-f1bb-48c7-85dd-c6a86aeb01b4');
		expect(session.timers.order).toEqual([]);
		expect(session.alerts[0]).toBeUndefined();
		coordinator.destroy();
	});

	it('retries a persisted background cancellation after reload', async () => {
		const values = new Map<string, string>();
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
			removeItem: (key: string) => values.delete(key)
		};
		const firstPush = {
			inspect: vi.fn(async () => ({ status: 'ready' as const })),
			enable: vi.fn(),
			sendTest: vi.fn(),
			schedule: vi.fn(async () => ({ status: 'armed' as const })),
			cancel: vi.fn(async () => ({ status: 'cancel-pending' as const }))
		};
		const first = new CookTimerCoordinator({
			browser: browserAdapters().browser,
			storage,
			push: firstPush,
			uuid: () => '4bb16cdf-f1bb-48c7-85dd-c6a86aeb01b4'
		});
		first.mount();
		const session = first.session({
			key: 'roast:direct',
			recipeSlug: 'roast',
			recipeTitle: 'Sunday roast'
		});
		session.start(0, 10, {
			label: 'OVEN',
			title: 'OVEN',
			body: 'Remove the tray',
			navigate: '/recipes/roast'
		});
		await Promise.resolve();
		session.cancel(0);
		await Promise.resolve();
		expect(session.alerts[0]?.status).toBe('cancel-pending');
		first.destroy();

		const restoredCancel = vi.fn(async () => ({ status: 'cancelled' as const }));
		const restored = new CookTimerCoordinator({
			browser: browserAdapters().browser,
			storage,
			push: {
				...firstPush,
				inspect: vi.fn(async () => ({ status: 'ready' as const })),
				cancel: restoredCancel
			}
		});
		restored.mount();
		await Promise.resolve();

		expect(restoredCancel).toHaveBeenCalledWith(
			'4bb16cdf-f1bb-48c7-85dd-c6a86aeb01b4'
		);
		restored.destroy();
	});
});
