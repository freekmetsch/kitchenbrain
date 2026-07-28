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

describe('CookTimerCoordinator', () => {
	it('keeps a timer alive while its cooking route is detached', () => {
		const clock = browserAdapters();
		const coordinator = new CookTimerCoordinator({ browser: clock.browser, storage: null });
		coordinator.mount();
		const session = coordinator.session({
			key: 'roast:direct',
			recipeSlug: 'roast',
			recipeTitle: 'Sunday roast'
		});

		session.start(0, 10, { label: 'OVEN · LEFT' });
		session.detachView();
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
		const first = new CookTimerCoordinator({ browser: firstClock.browser, storage });
		first.mount();
		first
			.session({ key: 'soup:direct', recipeSlug: 'soup', recipeTitle: 'Tomato soup' })
			.start(2, 60, { label: 'STIR' });
		first.destroy();

		const restoredClock = browserAdapters();
		const restored = new CookTimerCoordinator({ browser: restoredClock.browser, storage });

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
			storage
		});
		expect(reloaded.visibleTimers).toMatchObject([
			{ recipeTitle: 'Tomato soup', label: 'STIR', done: false }
		]);
		reloaded.destroy();
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

		session.detachView();
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
